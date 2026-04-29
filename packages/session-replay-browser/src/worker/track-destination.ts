/* eslint-disable no-restricted-globals */

import { KB_SIZE, MAX_URL_LENGTH, RETRY_TIMEOUT_MS } from '../constants';
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
}

interface FetchResult {
  shouldRetry: boolean;
  is413: boolean;
  success: boolean;
  message: string;
}

async function doFetch(payloadJson: string, context: SendContext): Promise<FetchResult> {
  try {
    const gzipped = 'CompressionStream' in self ? await gzipJson(payloadJson, self) : null;
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
    const res = await fetch(serverUrl, { method: 'POST', headers, body: (gzipped ?? payloadJson) as BodyInit });
    if (res === null) {
      return { shouldRetry: false, is413: false, success: false, message: UNEXPECTED_ERROR_MESSAGE };
    }
    if (res.status >= 200 && res.status < 300) {
      const sizeKB = Math.round(new Blob(context.events).size / KB_SIZE);
      return {
        shouldRetry: false,
        is413: false,
        success: true,
        message: `Session replay event batch tracked successfully for session id ${context.sessionId}, size of events: ${sizeKB} KB`,
      };
    }
    if (res.status === 413) {
      return { shouldRetry: false, is413: true, success: false, message: `HTTP 413` };
    }
    if (res.status >= 500 || res.status === 408 || res.status === 429 || res.status === 499) {
      return { shouldRetry: true, is413: false, success: false, message: `HTTP ${res.status}` };
    }
    return { shouldRetry: false, is413: false, success: false, message: UNEXPECTED_NETWORK_ERROR_MESSAGE };
  } catch (e) {
    return { shouldRetry: false, is413: false, success: false, message: String(e) };
  }
}

const MAX_SPLIT_DEPTH = 5;

// Sends a single payload batch, splitting on 413 and retrying on transient errors.
// Returns { success, message } without posting any postMessage — the caller handles that.
async function sendBatch(
  payload: { version: number; events: unknown[] },
  context: SendContext,
  useRetry: boolean,
  attempt: number,
  splitDepth = 0,
): Promise<{ success: boolean; message: string }> {
  const payloadJson = JSON.stringify(payload);
  const result = await doFetch(payloadJson, context);

  if (result.success) {
    return result;
  }

  if (result.is413 && payload.events.length > 1 && splitDepth < MAX_SPLIT_DEPTH) {
    // Split in half and attempt both portions independently.
    const half = Math.floor(payload.events.length / 2);
    const r1 = await sendBatch(
      { ...payload, events: payload.events.slice(0, half) },
      context,
      useRetry,
      1,
      splitDepth + 1,
    );
    const r2 = await sendBatch(
      { ...payload, events: payload.events.slice(half) },
      context,
      useRetry,
      1,
      splitDepth + 1,
    );
    // Return the first failure encountered, or success if both halves succeeded.
    if (!r1.success) return r1;
    return r2;
  }

  if (useRetry && result.shouldRetry && attempt < context.flushMaxRetries) {
    await new Promise<void>((resolve) => setTimeout(resolve, Math.random() * attempt * RETRY_TIMEOUT_MS));
    return sendBatch(payload, context, useRetry, attempt + 1);
  }

  const message = attempt >= context.flushMaxRetries ? MAX_RETRIES_EXCEEDED_MESSAGE : result.message;
  return { success: false, message };
}

async function sendWithRetry(
  id: string,
  payload: { version: number; events: unknown[] },
  context: SendContext,
  useRetry: boolean,
): Promise<void> {
  // Start at attempt=1 to match the main-thread's addToQueue behaviour, which increments
  // attempts to 1 before the first send.
  const result = await sendBatch(payload, context, useRetry, 1);
  if (result.success) {
    postMessage({ type: 'log', id, message: result.message });
  } else {
    postMessage({ type: 'warn', id, message: result.message });
  }
  postMessage({ type: 'complete', id });
}

onmessage = async (e: MessageEvent) => {
  const { type, id, payload, context, useRetry } = e.data as {
    type: string;
    id: string;
    payload: { version: number; events: unknown[] };
    context: SendContext;
    useRetry: boolean;
  };
  if (type === 'send') {
    await sendWithRetry(id, payload, context, useRetry);
  }
};

// exported for testing
export const trackDestinationOnMessage = onmessage;
