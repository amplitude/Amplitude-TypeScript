import { BaseTransport, getGlobalScope, ILogger, ServerZone, Status } from '@amplitude/analytics-core';
import { getCurrentUrl, getServerUrl } from './helpers';
import {
  MAX_RETRIES_EXCEEDED_MESSAGE,
  MISSING_API_KEY_MESSAGE,
  MISSING_DEVICE_ID_MESSAGE,
  SESSION_KILLED_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
  UNEXPECTED_NETWORK_ERROR_MESSAGE,
} from './messages';
import {
  SessionReplayTrackDestination as AmplitudeSessionReplayTrackDestination,
  SessionReplayDestination,
  SessionReplayDestinationContext,
} from './typings/session-replay';
import { VERSION } from './version';
import {
  MAX_URL_LENGTH,
  KB_SIZE,
  MAX_KEEPALIVE_BYTES,
  WAF_PAYLOAD_TOO_LARGE_PATTERN,
  EVENT_SKIPPED_HEADER,
  EVENT_SKIP_CODE_THROTTLED,
  EVENT_SKIP_CODE_INVALID_RANGE,
  EVENT_SKIP_CODE_CAPTURE_DISABLED,
  THROTTLED_FLUSH_PAUSE_MS,
  MERGE_AFTER_THROTTLE_SOFT_CAP,
} from './constants';
import { gzipJson } from './utils/gzip';

interface WorkerCompleteMessage {
  type: 'complete';
  id: string;
  err?: string;
  // null when the response was a clean 200 (no skip header), undefined when the
  // request did not produce a 200, otherwise the server's skip-code string.
  skipCode?: string | null;
}
interface WorkerLogMessage {
  type: 'log' | 'warn';
  id: string;
  message: string;
}
interface WorkerPayloadTooLargeMessage {
  type: 'payload_too_large';
  id: string;
  isWaf: boolean;
}
type WorkerMessage = WorkerCompleteMessage | WorkerLogMessage | WorkerPayloadTooLargeMessage;

export type PayloadBatcher = ({ version, events }: { version: number; events: string[] }) => {
  version: number;
  events: unknown[];
};

// Bounded so a long-lived SDK instance can't accumulate kill records indefinitely;
// sessions are time-bounded in practice, this cap is just a defensive ceiling.
const MAX_KILLED_SESSIONS = 256;

export class SessionReplayTrackDestination implements AmplitudeSessionReplayTrackDestination {
  loggerProvider: ILogger;
  storageKey = '';
  trackServerUrl?: string;
  retryTimeout = 1000;
  private scheduled: ReturnType<typeof setTimeout> | null = null;
  payloadBatcher: PayloadBatcher;
  queue: SessionReplayDestinationContext[] = [];
  private worker?: Worker;
  private sendIdCounter = 0;
  private pendingWorkerRequests = new Map<string, { context: SessionReplayDestinationContext; resolve: () => void }>();
  // Server back-pressure state, fed by the X-Session-Replay-Event-Skipped header on 200s.
  // The server uses this header (instead of 4xx) to signal a deliberate no-retry drop so SDKs
  // don't retry-storm. We honor it here by slowing or stopping our flush schedule.
  private flushPauseUntilMs = 0;
  // Set when schedule() defers a flush because we're inside a throttle pause; consumed by
  // flush() to merge same-session contexts before sending. Throttling is enforced by request
  // count, so collapsing N queued batches into one POST directly reduces throttle pressure.
  private mergeOnNextFlush = false;
  // Gates the merge log to once per throttle pause window — mirroring the throttle log's
  // transition-only gating — so a sustained throttle scenario doesn't spam logs every cycle.
  private mergeLogFiredThisPause = false;
  private killedSessions = new Set<string | number>();

  constructor({
    trackServerUrl,
    loggerProvider,
    payloadBatcher,
    workerScript,
  }: {
    trackServerUrl?: string;
    loggerProvider: ILogger;
    payloadBatcher?: PayloadBatcher;
    workerScript?: string;
  }) {
    this.loggerProvider = loggerProvider;
    this.payloadBatcher = payloadBatcher ? payloadBatcher : (payload) => payload;
    this.trackServerUrl = trackServerUrl;

    if (workerScript) {
      try {
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        const worker = new Worker(blobUrl);
        worker.onerror = (e) => {
          e.preventDefault();
          loggerProvider.error(
            `Track destination worker failed, falling back to main-thread sending: ${e.message} (${e.filename}:${e.lineno})`,
          );
          worker.terminate();
          this.worker = undefined;
          // Resolve pending promises so flush() doesn't hang. Do NOT call completeRequest
          // here — the events were never delivered, so onComplete must not fire and the
          // IDB/memory store entries must remain intact for recovery by sendStoredEvents.
          for (const [, pending] of this.pendingWorkerRequests) {
            loggerProvider.warn(`Session replay event send failed due to worker crash: ${e.message}`);
            pending.resolve();
          }
          this.pendingWorkerRequests.clear();
        };
        worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
          const msg = e.data;
          if (msg.type === 'log') {
            loggerProvider.log(msg.message);
          } else if (msg.type === 'warn') {
            loggerProvider.warn(msg.message);
          } else if (msg.type === 'payload_too_large') {
            const pending = this.pendingWorkerRequests.get(msg.id);
            if (pending) {
              this.handlePayloadTooLargeResponse(pending.context, msg.isWaf);
              pending.resolve();
              this.pendingWorkerRequests.delete(msg.id);
            }
          } else if (msg.type === 'complete') {
            const pending = this.pendingWorkerRequests.get(msg.id);
            if (pending) {
              if (msg.skipCode !== undefined) {
                this.applyServerDirective(pending.context.sessionId, msg.skipCode);
              }
              this.completeRequest({ context: pending.context });
              pending.resolve();
              this.pendingWorkerRequests.delete(msg.id);
            }
          }
        };
        this.worker = worker;
      } catch (error) {
        loggerProvider.error('Failed to create track destination worker, falling back to main-thread sending:', error);
      }
    }
  }

  sendEventsList(destinationData: SessionReplayDestination) {
    this.addToQueue({
      ...destinationData,
      attempts: 0,
      timeout: 0,
    });
  }

  /**
   * Sends events via navigator.sendBeacon on page exit.
   * Beacon payloads are sent as uncompressed JSON because sendBeacon does not support
   * Content-Encoding, and small incremental batches don't benefit much from compression.
   * The full snapshot has already been sent eagerly via fetch, so the beacon only needs
   * to cover the remaining incremental events since the last fetch flush.
   */
  sendBeacon({
    events,
    sessionId,
    deviceId,
    apiKey,
    serverZone,
  }: {
    events: string[];
    sessionId: string | number;
    deviceId: string;
    apiKey: string;
    serverZone?: keyof typeof ServerZone;
  }) {
    const MAX_BEACON_BYTES = 64 * 1024;
    const byteLength = (s: string) => new Blob([s]).size;
    let trimmedEvents = events;
    let payload = JSON.stringify({ version: 2, events: trimmedEvents });
    if (byteLength(payload) > MAX_BEACON_BYTES) {
      // Binary search for the largest prefix that fits within the beacon size limit.
      // Uses Blob.size to get the UTF-8 byte count, which is what sendBeacon measures.
      let lo = 0;
      let hi = trimmedEvents.length;
      while (lo < hi) {
        const mid = Math.floor((lo + hi + 1) / 2);
        if (byteLength(JSON.stringify({ version: 2, events: trimmedEvents.slice(0, mid) })) <= MAX_BEACON_BYTES) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      trimmedEvents = trimmedEvents.slice(0, lo);
      payload = JSON.stringify({ version: 2, events: trimmedEvents });
      this.loggerProvider.warn(
        `sendBeacon payload exceeded 64 KB limit, trimmed from ${events.length} to ${trimmedEvents.length} events`,
      );
    }
    if (trimmedEvents.length === 0) {
      return;
    }
    const urlParams = new URLSearchParams({
      device_id: deviceId,
      session_id: String(sessionId),
      type: 'replay',
      api_key: apiKey,
    });
    const serverUrl = `${getServerUrl(serverZone, this.trackServerUrl)}?${urlParams.toString()}`;
    const globalScope = getGlobalScope();
    try {
      // Wrap in a Blob to set Content-Type: application/json; a plain string would
      // cause the browser to send Content-Type: text/plain, which the server rejects.
      const payloadBlob = new Blob([payload], { type: 'application/json' });
      const sent = globalScope?.navigator?.sendBeacon?.(serverUrl, payloadBlob);
      if (sent === false) {
        this.loggerProvider.warn('sendBeacon failed to queue session replay payload');
      }
    } catch {
      // Best effort — no fallback on page exit.
    }
  }

  addToQueue(...list: SessionReplayDestinationContext[]) {
    const tryable = list.filter((context) => {
      if (this.killedSessions.has(context.sessionId)) {
        // Server has signaled capture_disabled or session_in_invalid_range for this session;
        // drop the batch (and clean up its IDB record via onComplete) instead of POSTing.
        this.completeRequest({
          context,
          err: SESSION_KILLED_MESSAGE,
        });
        return false;
      }
      if (context.attempts < (context.flushMaxRetries || 0)) {
        context.attempts += 1;
        return true;
      }
      this.completeRequest({
        context,
        err: MAX_RETRIES_EXCEEDED_MESSAGE,
      });
      return false;
    });
    tryable.forEach((context) => {
      this.queue = this.queue.concat(context);
      this.schedule(0);
    });
  }

  schedule(timeout: number) {
    if (this.scheduled) return;
    // If the server signaled throttling on a recent 200, defer the next flush until the
    // pause window ends. This lets us keep batching events without retry-storming the server.
    const pauseRemaining = this.flushPauseUntilMs - Date.now();
    const isPaused = pauseRemaining > 0;
    const effectiveTimeout = pauseRemaining > timeout ? pauseRemaining : timeout;
    if (isPaused) {
      // Mark the upcoming flush for merge: contexts piling up during the pause should
      // be coalesced into one POST per (session, device, api, type, ...) group.
      this.mergeOnNextFlush = true;
    }
    this.scheduled = setTimeout(() => {
      void this.flush(true).then(() => {
        if (this.queue.length > 0) {
          this.schedule(timeout);
        }
      });
    }, effectiveTimeout);
  }

  async flush(useRetry = false) {
    let list = this.queue;
    this.queue = [];

    if (this.scheduled) {
      clearTimeout(this.scheduled);
      this.scheduled = null;
    }

    if (this.mergeOnNextFlush) {
      this.mergeOnNextFlush = false;
      list = this.mergeQueueAfterThrottle(list);
    }

    for (const context of list) {
      await this.send(context, useRetry);
    }
  }

  /**
   * Coalesces queued contexts that share the same destination identity so the post-throttle
   * release sends fewer requests. Identity covers everything that affects the request URL,
   * routing, or per-request semantics — splitting on any difference keeps each merged POST
   * indistinguishable from the source contexts it replaced.
   *
   * Greedy concat with a soft char-length cap (`MERGE_AFTER_THROTTLE_SOFT_CAP`) keeps merged
   * payloads well under the 413 ceiling; on the rare oversized merge, the existing
   * split-and-retry path still bisects safely.
   *
   * The merged context's `onComplete` fans out to every source context's callback so each
   * underlying IDB sequence record is cleaned up exactly once on success.
   */
  private mergeQueueAfterThrottle(list: SessionReplayDestinationContext[]): SessionReplayDestinationContext[] {
    if (list.length <= 1) return list;

    const groups = new Map<string, SessionReplayDestinationContext[]>();
    for (const ctx of list) {
      // Anything that can change the URL, headers, or backend routing must split groups.
      const key = [
        ctx.sessionId,
        ctx.deviceId ?? '',
        ctx.apiKey ?? '',
        ctx.type,
        ctx.serverZone ?? '',
        ctx.sampleRate,
        ctx.version?.type ?? '',
        ctx.version?.version ?? '',
      ].join('|');
      const arr = groups.get(key);
      if (arr) arr.push(ctx);
      else groups.set(key, [ctx]);
    }

    const merged: SessionReplayDestinationContext[] = [];
    for (const group of groups.values()) {
      if (group.length === 1) {
        merged.push(group[0]);
        continue;
      }
      let current: SessionReplayDestinationContext | null = null;
      let currentChars = 0;
      const flushCurrent = () => {
        if (current) merged.push(current);
        current = null;
        currentChars = 0;
      };
      for (const ctx of group) {
        const ctxChars = ctx.events.reduce((sum, e) => sum + e.length, 0);
        if (current === null) {
          // Reset attempts to 0 on the merged context so the post-throttle delivery gets a
          // full retry budget. The throttle pause has already absorbed back-pressure; the
          // alternative (Math.max of source attempts) would collapse N source budgets into
          // one and end-of-life all N IDB records on a single retry exhaustion.
          current = { ...ctx, events: [...ctx.events], attempts: 0 };
          currentChars = ctxChars;
          continue;
        }
        if (currentChars + ctxChars > MERGE_AFTER_THROTTLE_SOFT_CAP) {
          flushCurrent();
          current = { ...ctx, events: [...ctx.events], attempts: 0 };
          currentChars = ctxChars;
          continue;
        }
        const prevOnComplete = current.onComplete;
        const ctxOnComplete = ctx.onComplete;
        current.events = current.events.concat(ctx.events);
        currentChars += ctxChars;
        current.onComplete = async () => {
          // Run both in parallel; an underlying store cleanup failure in one shouldn't
          // block the other. Errors are surfaced per the source callbacks' own handlers.
          await Promise.all([prevOnComplete(), ctxOnComplete()]);
        };
      }
      flushCurrent();
    }

    if (merged.length < list.length && !this.mergeLogFiredThisPause) {
      this.mergeLogFiredThisPause = true;
      this.loggerProvider.log(
        `Session replay throttle pause ended; merged ${list.length} queued batches into ${merged.length} request(s)`,
      );
    }
    return merged;
  }

  async send(context: SessionReplayDestinationContext, useRetry = true) {
    // A kill directive can arrive between flush() snapshotting the queue and us reaching
    // each context. Re-check before hitting the network so we don't waste POSTs on a
    // session the server has already told us to stop sending for.
    if (this.killedSessions.has(context.sessionId)) {
      return this.completeRequest({ context, err: SESSION_KILLED_MESSAGE });
    }
    const apiKey = context.apiKey;
    if (!apiKey) {
      return this.completeRequest({ context, err: MISSING_API_KEY_MESSAGE });
    }
    const deviceId = context.deviceId;
    if (!deviceId) {
      return this.completeRequest({ context, err: MISSING_DEVICE_ID_MESSAGE });
    }

    const payload = this.payloadBatcher({
      version: 1,
      events: context.events,
    });

    if (payload.events.length === 0) {
      this.completeRequest({ context });
      return;
    }

    const { worker } = this;
    if (worker) {
      return this.sendViaWorker(worker, context, payload, useRetry);
    }

    return this.sendOnMainThread(apiKey, deviceId, context, payload, useRetry);
  }

  private async sendViaWorker(
    worker: Worker,
    context: SessionReplayDestinationContext,
    payload: { version: number; events: unknown[] },
    useRetry: boolean,
  ): Promise<void> {
    const id = `${++this.sendIdCounter}`;
    return new Promise<void>((resolve) => {
      this.pendingWorkerRequests.set(id, { context, resolve });
      worker.postMessage({
        type: 'send',
        id,
        payload,
        useRetry,
        context: {
          apiKey: context.apiKey,
          deviceId: context.deviceId,
          sessionId: context.sessionId,
          events: context.events,
          eventType: context.type,
          flushMaxRetries: context.flushMaxRetries ?? 0,
          sampleRate: context.sampleRate,
          serverZone: context.serverZone,
          trackServerUrl: this.trackServerUrl,
          version: context.version,
          currentUrl: getCurrentUrl(),
          sdkVersion: VERSION,
        },
      });
    });
  }

  private async sendOnMainThread(
    apiKey: string,
    deviceId: string,
    context: SessionReplayDestinationContext,
    payload: { version: number; events: unknown[] },
    useRetry: boolean,
  ): Promise<void> {
    const url = getCurrentUrl();
    const version = VERSION;
    const sampleRate = context.sampleRate;
    const urlParams = new URLSearchParams({
      device_id: deviceId,
      session_id: `${context.sessionId}`,
      type: `${context.type}`,
    });
    const sessionReplayLibrary = `${context.version?.type ?? 'standalone'}/${context.version?.version ?? version}`;

    try {
      const payloadJson = JSON.stringify(payload);
      // Only await gzip when CompressionStream is actually available; skipping the
      // await entirely preserves the synchronous fast-path for browsers/environments
      // (e.g. Jest) that don't support it, keeping retry-timing tests unaffected.
      const globalScope = getGlobalScope();
      const gzipped =
        globalScope && 'CompressionStream' in globalScope ? await gzipJson(payloadJson, globalScope) : null;
      const payloadSize = gzipped ? gzipped.byteLength : new Blob([payloadJson]).size;
      const options: RequestInit = {
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          Authorization: `Bearer ${apiKey}`,
          'X-Client-Version': version,
          'X-Client-Library': sessionReplayLibrary,
          'X-Client-Url': url.substring(0, MAX_URL_LENGTH), // limit url length to 1000 characters to avoid ELB 400 error
          'X-Client-Sample-Rate': `${sampleRate}`,
          'X-Sampling-Hash-Alg': 'xxhash32',
          ...(gzipped ? { 'Content-Encoding': 'gzip' } : {}),
        },
        body: (gzipped ?? payloadJson) as BodyInit,
        method: 'POST',
        // keepalive lets the request survive page navigation, preventing 499 (client-closed) errors.
        // Must stay under the browser's 64 KB keepalive budget; large payloads skip it.
        keepalive: payloadSize <= MAX_KEEPALIVE_BYTES,
      };

      const serverUrl = `${getServerUrl(context.serverZone, this.trackServerUrl)}?${urlParams.toString()}`;
      const res = await fetch(serverUrl, options);
      if (res === null) {
        this.completeRequest({ context, err: UNEXPECTED_ERROR_MESSAGE });
        return;
      }
      if (res.status >= 200 && res.status < 300) {
        const skipCode = res.headers?.get?.(EVENT_SKIPPED_HEADER) ?? null;
        this.applyServerDirective(context.sessionId, skipCode);
      }
      if (!useRetry) {
        let responseBody = '';
        try {
          responseBody = JSON.stringify(res.body, null, 2);
        } catch {
          // to avoid crash, but don't care about the error, add comment to avoid empty block lint error
        }
        this.completeRequest({ context, success: `${res.status}: ${responseBody}` });
      } else {
        let responseBody = '';
        if (res.status === 413) {
          try {
            responseBody = await res.text();
          } catch {
            // best effort
          }
        }
        await this.handleReponse(res.status, context, responseBody);
      }
    } catch (e) {
      this.completeRequest({ context, err: e as string });
    }
  }

  async handleReponse(status: number, context: SessionReplayDestinationContext, responseBody = '') {
    const parsedStatus = new BaseTransport().buildStatus(status);
    switch (parsedStatus) {
      case Status.Success:
        this.handleSuccessResponse(context);
        break;
      case Status.Failed:
      case Status.Timeout: // 408: server timed out waiting for request, data not received
      case Status.RateLimit: // 429: retry with existing backoff rather than silently dropping
        await this.handleOtherResponse(context);
        break;
      case Status.PayloadTooLarge:
        this.handlePayloadTooLargeResponse(context, WAF_PAYLOAD_TOO_LARGE_PATTERN.test(responseBody));
        break;
      default:
        // 499 (client closed connection / upstream dropped) is also retryable
        if (status === 499) {
          await this.handleOtherResponse(context);
          break;
        }
        this.completeRequest({ context, err: UNEXPECTED_NETWORK_ERROR_MESSAGE });
    }
  }

  handlePayloadTooLargeResponse(context: SessionReplayDestinationContext, isWaf: boolean): void {
    const source = isWaf ? 'WAF (compressed payload too large)' : 'server (event too large)';
    const totalSizeKB = Math.round(context.events.reduce((sum, e) => sum + e.length, 0) / KB_SIZE);

    if (!isWaf) {
      this.completeRequest({
        context,
        err: `Session replay event batch dropped: ${source} rejected payload (${context.events.length} events, ${totalSizeKB} KB) — not retrying non-WAF 413`,
      });
      return;
    }

    if (context.events.length === 1) {
      this.completeRequest({
        context,
        err: `Session replay event dropped: single event (${totalSizeKB} KB, 1 event) rejected by ${source} — cannot split further`,
      });
      return;
    }

    this.loggerProvider.warn(
      `Session replay event batch rejected by ${source} (${context.events.length} events, ${totalSizeKB} KB total) — splitting and retrying`,
    );

    // Clean up the original IDB record, then re-enqueue both halves as new in-memory batches.
    // For a merged-on-throttle context (mergeQueueAfterThrottle), this onComplete is the
    // fanned-out callback covering N source IDB records — they'll all be cleaned up here.
    // Halves get noop onCompletes, so a page-close between this cleanup and a half delivery
    // means up to N source sequences are lost. The merge soft cap (1.4MB chars) is well under
    // the 10MB compressed 413 ceiling, so a 413 on a merged context is exceedingly rare in
    // practice; the alternative — deferring source cleanup until both halves complete — would
    // significantly complicate the retry path for marginal benefit.
    void context.onComplete();
    const noop = (): Promise<void> => Promise.resolve();
    const mid = Math.floor(context.events.length / 2);
    this.sendEventsList({ ...context, events: context.events.slice(0, mid), onComplete: noop });
    this.sendEventsList({ ...context, events: context.events.slice(mid), onComplete: noop });
  }

  handleSuccessResponse(context: SessionReplayDestinationContext) {
    const sizeOfEventsList = Math.round(new Blob(context.events).size / KB_SIZE);
    this.completeRequest({
      context,
      success: `Session replay event batch tracked successfully for session id ${context.sessionId}, size of events: ${sizeOfEventsList} KB`,
    });
  }

  async handleOtherResponse(context: SessionReplayDestinationContext) {
    const delay = Math.random() * context.attempts * this.retryTimeout;
    context.attempts++;
    if (context.attempts > (context.flushMaxRetries || 0)) {
      this.completeRequest({ context, err: MAX_RETRIES_EXCEEDED_MESSAGE });
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    await this.send(context, true);
  }

  completeRequest({
    context,
    err,
    success,
  }: {
    context: SessionReplayDestinationContext;
    err?: string;
    success?: string;
  }) {
    void context.onComplete();
    if (err) {
      this.loggerProvider.warn(err);
    } else if (success) {
      this.loggerProvider.log(success);
    }
  }

  /**
   * Applies the server's back-pressure signal carried on a 200 response.
   *
   * - `EVENT_SKIP_CODE_THROTTLED` (server-side rate limit): pause the flush schedule
   *   for `THROTTLED_FLUSH_PAUSE_MS` so we keep batching events instead of retry-storming.
   * - `EVENT_SKIP_CODE_CAPTURE_DISABLED` / `EVENT_SKIP_CODE_INVALID_RANGE`: hard kill
   *   switch for this session — drop the queued contexts and stop accepting new ones.
   *   New sessions are unaffected.
   * - `null` (clean 200, no header): clear any throttle pause; subsequent flushes resume
   *   on the normal cadence.
   */
  private applyServerDirective(sessionId: string | number, skipCode: string | null) {
    if (skipCode === null) {
      this.flushPauseUntilMs = 0;
      this.mergeLogFiredThisPause = false;
      return;
    }
    if (skipCode === EVENT_SKIP_CODE_THROTTLED) {
      const wasInPause = this.flushPauseUntilMs > Date.now();
      this.flushPauseUntilMs = Date.now() + THROTTLED_FLUSH_PAUSE_MS;
      // Log only on pause-state transitions — a throttled server may reply to many
      // batches per minute, and one log per batch would flood the console.
      if (!wasInPause) {
        this.loggerProvider.log(
          `Session replay throttled by server; pausing flush schedule for ${THROTTLED_FLUSH_PAUSE_MS / 1000}s`,
        );
      }
      return;
    }
    if (skipCode === EVENT_SKIP_CODE_CAPTURE_DISABLED || skipCode === EVENT_SKIP_CODE_INVALID_RANGE) {
      this.killSession(sessionId, skipCode);
    }
    // Unknown skip codes are ignored — the server may add new ones, and our default
    // behavior (treat as a normal 200) preserves throughput rather than penalizing the
    // session for a code we don't recognize.
  }

  private killSession(sessionId: string | number, skipCode: string) {
    if (this.killedSessions.has(sessionId)) return;
    this.killedSessions.add(sessionId);
    // Set preserves insertion order, so deleting the first key evicts the oldest entry.
    if (this.killedSessions.size > MAX_KILLED_SESSIONS) {
      for (const oldest of this.killedSessions) {
        this.killedSessions.delete(oldest);
        break;
      }
    }
    this.loggerProvider.log(
      `Session replay capture stopped for session ${sessionId} by server directive ${skipCode}; remaining events will be dropped`,
    );
    // Drain any queued contexts for this session so their IDB records get cleaned up
    // via onComplete, instead of sitting in the queue waiting for a flush we'll never make.
    const remaining: SessionReplayDestinationContext[] = [];
    for (const queued of this.queue) {
      if (queued.sessionId === sessionId) {
        this.completeRequest({ context: queued, err: SESSION_KILLED_MESSAGE });
      } else {
        remaining.push(queued);
      }
    }
    this.queue = remaining;
  }
}
