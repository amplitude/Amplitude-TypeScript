/* eslint-disable no-restricted-globals */

import {
  EVENT_SKIPPED_HEADER,
  KB_SIZE,
  MAX_URL_LENGTH,
  MAX_KEEPALIVE_BYTES,
  RETRY_TIMEOUT_MS,
  SEND_TIMEOUT_MS,
  WAF_PAYLOAD_TOO_LARGE_PATTERN,
} from '../constants';
import { MAX_RETRIES_EXCEEDED_MESSAGE, UNEXPECTED_ERROR_MESSAGE, UNEXPECTED_NETWORK_ERROR_MESSAGE } from '../messages';
import { gzipJson } from '../utils/gzip';
import { getServerUrl } from '../utils/server-url';

interface SendContext {
  apiKey: string;
  deviceId: string;
  sessionId: number | string;
  events: string[]; // original event strings, used for size calculation only
  eventType: string;
  flushMaxRetries: number;
  sampleRate: number;
  serverZone?: string;
  trackServerUrl?: string;
  version?: { type: string; version: string };
  currentUrl: string;
  sdkVersion: string;
  // When false, the worker sends the raw JSON body with no Content-Encoding header.
  // Optional for backwards compatibility with messages from older main-thread code
  // that doesn't forward the flag; absence is treated as enabled (default true).
  enableTransportCompression?: boolean;
  // Milliseconds before the worker aborts the in-flight fetch; <= 0 disables the abort.
  // Optional for backwards compatibility with older main-thread code that doesn't forward
  // it; absence falls back to SEND_TIMEOUT_MS.
  sendTimeoutMs?: number;
}

// Minimal subset of `Response` that doFetch's status handling relies on. Both the built-in
// `fetch` path and the main-thread delegation path produce something of this shape, so the
// status/skip-header/413-body logic below stays identical regardless of which transport runs.
interface ResponseLike {
  status: number;
  headers?: { get?: (name: string) => string | null };
  text: () => Promise<string>;
}

interface RequestOptions {
  method: 'POST';
  headers: Record<string, string>;
  // string | Uint8Array (not BodyInit) so it stays structured-cloneable across postMessage.
  body: string | Uint8Array;
  keepalive: boolean;
  // Send-timeout abort signal — doFetch always supplies controller.signal. The built-in fetch
  // path passes it straight to fetch(); the delegation path listens for it to reject a hung
  // attempt (the request itself runs on the main thread and can't be cancelled from here).
  signal: AbortSignal;
}

type DoRequest = (url: string, options: RequestOptions) => Promise<ResponseLike>;

// ---- Main-thread fetch delegation (custom transport / handleSendEvents) -------------------
// Functions can't cross postMessage, so when the customer supplies a custom transport the
// worker can't run it. Instead the worker delegates each network attempt to the main thread:
// it posts a `fetch-request`, the main thread runs handleSendEvents, and posts back a
// `fetch-response`. Retry stays in the worker (sendWithRetry), so the callback is still
// invoked once per attempt with retry wrapped around it — identical to the main-thread path.
// Both ends of this protocol ship in the same build, so the main thread always sends
// well-formed messages: `skipHeader` is the EVENT_SKIPPED_HEADER value on a 2xx (else null),
// and `body` is always a string ('' when there's nothing to read, or the error text). They
// are therefore required, which keeps the worker-side reconstruction free of defensive
// nullish handling.
interface FetchResponseMessage {
  type: 'fetch-response';
  requestId: string;
  status: number;
  skipHeader: string | null;
  body: string;
  // True when the main-thread transport threw / rejected.
  error?: boolean;
}

// Module-level state, scoped to this worker bundle. Each SessionReplayTrackDestination spins up
// its own Worker (and a shutdown()+re-init in a SPA creates a fresh one), so a new session gets a
// brand-new module scope — these are never shared across sessions and requestIds can't collide
// between them. They intentionally hold only in-flight delegations for the single owning instance.
let delegationCounter = 0;
const pendingDelegations = new Map<string, (resp: FetchResponseMessage) => void>();

const defaultRequest: DoRequest = (url, options) => fetch(url, options) as Promise<ResponseLike>;

// Posts a fetch-request to the main thread and resolves once the matching fetch-response
// arrives. Rejects if the main-thread transport errored, so doFetch's catch surfaces it the
// same way a thrown fetch would (no retry) — matching the non-worker custom-transport path.
//
// The send-timeout AbortController lives in doFetch. The built-in fetch honors its signal
// directly; a delegated attempt runs the customer's transport on the main thread and can't
// cancel it from here, but we still listen for the abort so a hung/never-settling transport
// rejects this attempt as a retryable AbortError (matching the built-in path) instead of
// leaving sendWithRetry awaiting forever and leaking the in-flight delegation. The main thread
// may still post a late fetch-response, but its requestId is gone from pendingDelegations by
// then, so onmessage drops it.
const delegateRequest: DoRequest = (url, options) => {
  const requestId = `${++delegationCounter}`;
  return new Promise<ResponseLike>((resolve, reject) => {
    const { signal } = options;
    const abort = () => {
      pendingDelegations.delete(requestId);
      // Browsers reject aborted fetches with a DOMException named 'AbortError'; doFetch's catch
      // matches on the name, so a plain Error with the same name takes the same retryable path.
      const err = new Error('Delegated session replay fetch aborted by send timeout');
      err.name = 'AbortError';
      reject(err);
    };
    // doFetch arms the timeout after this runs, so the signal is never already aborted here;
    // listening for the event covers every real abort.
    signal.addEventListener('abort', abort, { once: true });
    pendingDelegations.set(requestId, (resp) => {
      signal.removeEventListener('abort', abort);
      if (resp.error) {
        reject(new Error(resp.body));
        return;
      }
      // Reconstruct just the slice of Response that doFetch consumes. get() is only ever
      // queried for EVENT_SKIPPED_HEADER today; the name check keeps it self-documenting and
      // safe if a future reader adds another header lookup (the other branch is unreachable now).
      resolve({
        status: resp.status,
        headers: {
          get: (name: string) => (name === EVENT_SKIPPED_HEADER ? resp.skipHeader : /* istanbul ignore next */ null),
        },
        text: () => Promise.resolve(resp.body),
      });
    });
    postMessage({
      type: 'fetch-request',
      requestId,
      url,
      method: 'POST',
      headers: options.headers,
      body: options.body,
      keepalive: options.keepalive,
    });
  });
};

async function doFetch(
  payloadJson: string,
  context: SendContext,
  doRequest: DoRequest,
): Promise<{
  shouldRetry: boolean;
  success: boolean;
  message: string;
  payloadTooLarge?: boolean;
  isWaf?: boolean;
  // null when the server returned a 2xx with no skip header; the code string when present;
  // undefined when the response was not a 2xx (caller should not interpret as a directive).
  skipCode?: string | null;
}> {
  // <= 0 disables the abort (no timer); otherwise honor the forwarded value, falling back
  // to the default when older main-thread code doesn't send one. Declared here (not inside
  // try) so the AbortError message in catch can reference it.
  const sendTimeoutMs = context.sendTimeoutMs ?? SEND_TIMEOUT_MS;
  try {
    // Treat an absent flag as enabled so messages from older main-thread builds that
    // don't forward the field keep working unchanged. Only an explicit `false` opts out.
    const compressionEnabled = context.enableTransportCompression !== false;
    const gzipped = compressionEnabled && 'CompressionStream' in self ? await gzipJson(payloadJson, self) : null;
    const sessionReplayLibrary = `${context.version?.type ?? 'standalone'}/${
      context.version?.version ?? context.sdkVersion
    }`;
    const urlParams = new URLSearchParams({
      device_id: context.deviceId,
      session_id: `${context.sessionId}`,
      type: context.eventType,
    });
    const serverUrl = `${getServerUrl(context.serverZone, context.trackServerUrl)}?${urlParams.toString()}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: '*/*',
      Authorization: `Bearer ${context.apiKey}`,
      'X-Client-Version': context.sdkVersion,
      'X-Client-Library': sessionReplayLibrary,
      'X-Client-Url': context.currentUrl.substring(0, MAX_URL_LENGTH),
      'X-Client-Sample-Rate': `${context.sampleRate}`,
      'X-Sampling-Hash-Alg': 'xxhash32',
      ...(gzipped ? { 'Content-Encoding': 'gzip' } : {}),
    };
    const payloadSize = gzipped ? gzipped.byteLength : new Blob([payloadJson]).size;
    // fetch() has no native timeout; abort a hung request so it surfaces as a retryable
    // failure instead of silently wedging the worker (and the awaiting orchestrator). The
    // request goes through doRequest so a custom transport (delegated to the main thread) is
    // honored; both paths observe the abort signal — the built-in fetch cancels directly, and
    // delegateRequest rejects the pending delegation so a hung transport still times out.
    const controller = new AbortController();
    const timeout =
      sendTimeoutMs > 0
        ? setTimeout(() => {
            controller.abort();
          }, sendTimeoutMs)
        : undefined;
    let res: ResponseLike | null;
    try {
      res = await doRequest(serverUrl, {
        method: 'POST',
        headers,
        body: gzipped ?? payloadJson,
        // keepalive lets the request survive page navigation, preventing 499 (client-closed) errors.
        // Must stay under the browser's 64 KB keepalive budget; large payloads skip it.
        keepalive: payloadSize <= MAX_KEEPALIVE_BYTES,
        signal: controller.signal,
      });
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    if (res === null) {
      return { shouldRetry: false, success: false, message: UNEXPECTED_ERROR_MESSAGE };
    }
    if (res.status >= 200 && res.status < 300) {
      const sizeKB = Math.round(new Blob(context.events).size / KB_SIZE);
      const skipCode = res.headers?.get?.(EVENT_SKIPPED_HEADER) ?? null;
      return {
        shouldRetry: false,
        success: true,
        message: `Session replay event batch tracked successfully for session id ${context.sessionId}, size of events: ${sizeKB} KB`,
        skipCode,
      };
    }
    if (res.status === 413) {
      let body = '';
      try {
        body = await res.text();
      } catch {
        // best effort
      }
      return {
        shouldRetry: false,
        success: false,
        message: UNEXPECTED_NETWORK_ERROR_MESSAGE,
        payloadTooLarge: true,
        isWaf: WAF_PAYLOAD_TOO_LARGE_PATTERN.test(body),
      };
    }
    if (res.status >= 500 || res.status === 408 || res.status === 429 || res.status === 499) {
      return { shouldRetry: true, success: false, message: `HTTP ${res.status}` };
    }
    return { shouldRetry: false, success: false, message: UNEXPECTED_NETWORK_ERROR_MESSAGE };
  } catch (e) {
    // A timeout aborts the fetch, rejecting with an AbortError. That's transient — let
    // sendWithRetry's budget retry it, mirroring the 5xx/408/429/499 path. Other errors
    // stay non-retryable as before. Browsers reject with a DOMException named 'AbortError'
    // (not an Error instance), so match on the name rather than using `instanceof Error`.
    if (!!e && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError') {
      return {
        shouldRetry: true,
        success: false,
        message: `Session replay worker request timed out after ${sendTimeoutMs}ms`,
      };
    }
    return { shouldRetry: false, success: false, message: String(e) };
  }
}

async function sendWithRetry(
  id: string,
  payloadJson: string,
  context: SendContext,
  useRetry: boolean,
  doRequest: DoRequest,
): Promise<void> {
  // Start at 1 to match the main-thread's addToQueue behaviour, which increments
  // attempts to 1 before the first send. This ensures the same total number of
  // attempts and the same per-retry delay as the main-thread path.
  let attempt = 1;
  for (;;) {
    const result = await doFetch(payloadJson, context, doRequest);
    if (result.success) {
      postMessage({ type: 'log', id, message: result.message });
      postMessage({ type: 'complete', id, skipCode: result.skipCode ?? null });
      return;
    }
    if (result.payloadTooLarge && useRetry) {
      postMessage({ type: 'payload_too_large', id, isWaf: result.isWaf === true });
      return;
    }
    if (useRetry && result.shouldRetry && attempt < context.flushMaxRetries) {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.random() * attempt * RETRY_TIMEOUT_MS));
      attempt++;
      continue;
    }
    const msg = attempt >= context.flushMaxRetries ? MAX_RETRIES_EXCEEDED_MESSAGE : result.message;
    postMessage({ type: 'warn', id, message: msg });
    postMessage({ type: 'complete', id });
    return;
  }
}

onmessage = async (e: MessageEvent) => {
  const data = e.data as {
    type: string;
    id: string;
    payload: { version: number; events: unknown[] };
    context: SendContext;
    useRetry: boolean;
    // When true, delegate each network attempt to the main thread (custom transport).
    useCustomTransport?: boolean;
  } & Partial<FetchResponseMessage>;

  // Reply from the main thread to a delegated fetch — resolve the waiting attempt.
  if (data.type === 'fetch-response') {
    const resolver = pendingDelegations.get(data.requestId as string);
    if (resolver) {
      pendingDelegations.delete(data.requestId as string);
      resolver(data as FetchResponseMessage);
    }
    return;
  }

  if (data.type === 'send') {
    const { id, payload, context, useRetry, useCustomTransport } = data;
    const payloadJson = JSON.stringify(payload);
    // Only enter the delegation protocol when a custom transport is configured; otherwise the
    // worker keeps doing its own fetch with no round-trip to the main thread (unchanged path).
    const doRequest = useCustomTransport ? delegateRequest : defaultRequest;
    await sendWithRetry(id, payloadJson, context, useRetry, doRequest);
  }
};

// exported for testing
export const trackDestinationOnMessage = onmessage;
