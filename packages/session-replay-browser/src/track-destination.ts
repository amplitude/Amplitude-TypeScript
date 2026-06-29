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
  SEND_TIMEOUT_MS,
} from './constants';
import { gzipJson } from './utils/gzip';
import { SessionReplaySendEventsHandler } from './config/types';

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
// Worker asks the main thread to run the custom transport for one network attempt (the
// callback can't cross postMessage, so it lives on the main thread). Replied to with a
// 'fetch-response' message posted back into the worker.
interface WorkerFetchRequestMessage {
  type: 'fetch-request';
  requestId: string;
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  // string | Uint8Array (not BodyInit) so it stays structured-cloneable across postMessage.
  body: string | Uint8Array;
  keepalive: boolean;
}
type WorkerMessage =
  | WorkerCompleteMessage
  | WorkerLogMessage
  | WorkerPayloadTooLargeMessage
  | WorkerFetchRequestMessage;

export type PayloadBatcher = ({ version, events }: { version: number; events: string[] }) => {
  version: number;
  events: unknown[];
};

// Bounded so a long-lived SDK instance can't accumulate kill records indefinitely;
// sessions are time-bounded in practice, this cap is just a defensive ceiling.
const MAX_KILLED_SESSIONS = 256;

// Defensive ceiling on retained timed-out worker requests (see timedOutWorkerRequests).
// In normal operation each entry is removed when the worker's late message arrives; this
// cap only guards the pathological case of a wedged worker that never replies at all.
const MAX_TIMED_OUT_WORKER_REQUESTS = 256;

// Settles with `promise`, but rejects early with an AbortError when `signal` fires. Used to apply
// the send timeout to a custom transport whose own promise can't be cancelled: a hung transport
// then surfaces as a retryable timeout (matching the built-in fetch and worker delegation paths)
// instead of blocking the serial flush loop. The transport's promise keeps running; we just stop
// awaiting it. `signal` is always supplied with the send-timeout controller's signal.
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      // Match how browsers reject an aborted fetch (DOMException 'AbortError'); sendOnMainThread's
      // catch keys off the name to route it through the retry budget rather than failing fatally.
      const err = new Error('Custom session replay transport aborted by send timeout');
      err.name = 'AbortError';
      reject(err);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

export class SessionReplayTrackDestination implements AmplitudeSessionReplayTrackDestination {
  loggerProvider: ILogger;
  storageKey = '';
  trackServerUrl?: string;
  retryTimeout = 1000;
  // Defaults to true (gzip enabled) so existing call sites that don't pass the flag
  // retain pre-flag behavior. The local-config layer also defaults to true; this
  // belt-and-braces default protects direct constructor callers (e.g. tests).
  private enableTransportCompression: boolean;
  // Milliseconds before an in-flight send is aborted; <= 0 disables the abort/timeout.
  // Defaults to SEND_TIMEOUT_MS. Configurable so large slow-but-succeeding uploads aren't
  // killed (and retried) at an over-aggressive default. See config.sendTimeoutMs.
  private sendTimeoutMs: number;
  private scheduled: ReturnType<typeof setTimeout> | null = null;
  payloadBatcher: PayloadBatcher;
  queue: SessionReplayDestinationContext[] = [];
  private worker?: Worker;
  private sendIdCounter = 0;
  private pendingWorkerRequests = new Map<
    string,
    { context: SessionReplayDestinationContext; resolve: () => void; timeout?: ReturnType<typeof setTimeout> }
  >();
  // Requests the main thread stopped awaiting after SEND_TIMEOUT_MS (so the serial flush
  // loop could proceed) but whose worker may still be retrying in the background. We keep
  // the context — bounded, like killedSessions — so a *late* worker complete/payload_too_large
  // can still run completeRequest and settle the store record. Without this the late message
  // is dropped (its id is gone from pendingWorkerRequests), so a successful late delivery would
  // leave the IDB/memory record behind for sendStoredEvents to re-upload as duplicate replay data.
  private timedOutWorkerRequests = new Map<string, SessionReplayDestinationContext>();
  // Server back-pressure state, fed by the X-Session-Replay-Event-Skipped header on 200s.
  // The server uses this header (instead of 4xx) to signal a deliberate no-retry drop so SDKs
  // don't retry-storm. We honor it here by slowing or stopping our flush schedule.
  private flushPauseUntilMs = 0;
  // Set when schedule() defers a flush because we're inside a throttle pause; consumed by
  // flush() to merge same-session contexts before sending. Throttling is enforced by request
  // count, so collapsing N queued batches into one POST directly reduces throttle pressure.
  private mergeOnNextFlush = false;
  // Set by markCoalesceNextFlush() before the page-load backlog is enqueued; consumed by
  // flush() to coalesce the drained persisted sequences. Distinct from
  // mergeOnNextFlush so the drain isn't conflated with a throttle pause for logging.
  private coalesceNextFlush = false;
  // Gates the merge log to once per throttle pause window — mirroring the throttle log's
  // transition-only gating — so a sustained throttle scenario doesn't spam logs every cycle.
  private mergeLogFiredThisPause = false;
  private killedSessions = new Set<string | number>();
  // Optional customer-supplied transport. When set, it replaces the internal fetch for every
  // event-upload attempt; retry/response handling stays where it is, so the callback sits
  // below retry and is invoked once per attempt.
  private handleSendEvents?: SessionReplaySendEventsHandler;

  constructor({
    trackServerUrl,
    loggerProvider,
    payloadBatcher,
    workerScript,
    enableTransportCompression,
    sendTimeoutMs,
    handleSendEvents,
  }: {
    trackServerUrl?: string;
    loggerProvider: ILogger;
    payloadBatcher?: PayloadBatcher;
    workerScript?: string;
    enableTransportCompression?: boolean;
    sendTimeoutMs?: number;
    handleSendEvents?: SessionReplaySendEventsHandler;
  }) {
    this.loggerProvider = loggerProvider;
    this.payloadBatcher = payloadBatcher ? payloadBatcher : (payload) => payload;
    this.trackServerUrl = trackServerUrl;
    this.enableTransportCompression = enableTransportCompression ?? true;
    this.sendTimeoutMs = sendTimeoutMs ?? SEND_TIMEOUT_MS;
    this.handleSendEvents = handleSendEvents;

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
            // Cancel the per-request timeout — onerror already settles every pending
            // promise, so leaving the timer armed would fire a spurious timeout warn later.
            if (pending.timeout) clearTimeout(pending.timeout);
            loggerProvider.warn(`Session replay event send failed due to worker crash: ${e.message}`);
            pending.resolve();
          }
          this.pendingWorkerRequests.clear();
          // The worker is gone, so no late completion can arrive for timed-out requests either.
          // Drop the retained contexts to free memory; their store records stay intact (we never
          // completeRequest here) so sendStoredEvents can recover them on next init.
          this.timedOutWorkerRequests.clear();
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
              if (pending.timeout) clearTimeout(pending.timeout);
              this.handlePayloadTooLargeResponse(pending.context, msg.isWaf);
              pending.resolve();
              this.pendingWorkerRequests.delete(msg.id);
            } else {
              // Late message for a request the main thread already timed out: the worker still
              // determined the payload was too large, so split-and-retry off the original record.
              const timedOut = this.timedOutWorkerRequests.get(msg.id);
              if (timedOut) {
                this.timedOutWorkerRequests.delete(msg.id);
                this.handlePayloadTooLargeResponse(timedOut, msg.isWaf);
              }
            }
          } else if (msg.type === 'complete') {
            const pending = this.pendingWorkerRequests.get(msg.id);
            if (pending) {
              if (pending.timeout) clearTimeout(pending.timeout);
              if (msg.skipCode !== undefined) {
                this.applyServerDirective(pending.context.sessionId, msg.skipCode);
              }
              this.completeRequest({ context: pending.context });
              pending.resolve();
              this.pendingWorkerRequests.delete(msg.id);
            } else {
              // Late completion for a request the main thread already timed out. The worker's
              // actual outcome (delivered, or retries exhausted) is authoritative, so settle the
              // store record by it rather than leaving it behind for sendStoredEvents to re-upload.
              const timedOut = this.timedOutWorkerRequests.get(msg.id);
              if (timedOut) {
                this.timedOutWorkerRequests.delete(msg.id);
                if (msg.skipCode !== undefined) {
                  this.applyServerDirective(timedOut.sessionId, msg.skipCode);
                }
                this.completeRequest({ context: timedOut });
              }
            }
          } else if (msg.type === 'fetch-request') {
            // Worker is delegating one network attempt to the custom transport (which lives on
            // the main thread). Run it and post the result back into the worker's retry loop.
            // Guard the fire-and-forget call: if posting the result back fails (e.g. the worker
            // was terminated mid-flight), surface it to the logger instead of leaving an
            // unhandled rejection.
            void this.handleDelegatedFetch(worker, msg).catch((e) => {
              loggerProvider.warn('Failed to handle delegated session replay fetch:', e);
            });
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
   * Marks the next scheduled flush to coalesce its queued contexts by destination identity.
   * Callers use this immediately before enqueuing the page-load backlog drain (many persisted
   * sequences replayed back-to-back on init via sendStoredEvents). Because those enqueues are
   * synchronous and the flush is deferred to the next tick via schedule(0), the whole backlog
   * lands in the queue before the flag is consumed — collapsing N small POSTs into far fewer
   * and avoiding the request flood observed on page load. Steady-state live capture
   * never sets this flag, so its sending behavior is unchanged.
   *
   * Schedules a flush so the flag is always consumed by the next flush, even when every
   * backlog sequence is dropped before reaching the queue (e.g. all events oversized) and no
   * enqueue schedules one itself. Otherwise the flag would stick and a later unrelated live
   * flush could coalesce live batches as if they were a page-load drain.
   */
  markCoalesceNextFlush() {
    this.coalesceNextFlush = true;
    this.schedule(0);
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
    // Custom-transport page-exit path: navigator.sendBeacon cannot carry custom headers, so a
    // JWT customer's exit batch would go out unauthenticated and be rejected by their proxy.
    // Instead, route it through the callback with keepalive (which survives unload AND carries
    // headers). Mirrors the main-send request shape: Authorization header + device_id/session_id/
    // type params (api_key is NOT placed in the URL, unlike the legacy beacon path below).
    if (this.handleSendEvents) {
      const exitParams = new URLSearchParams({
        device_id: deviceId,
        session_id: String(sessionId),
        type: 'replay',
      });
      const exitUrl = `${getServerUrl(serverZone, this.trackServerUrl)}?${exitParams.toString()}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: '*/*',
        Authorization: `Bearer ${apiKey}`,
      };
      this.loggerProvider.debug(
        `Routing session replay exit batch (${trimmedEvents.length} events) through custom transport for session id ${sessionId}.`,
      );
      try {
        // Fire-and-forget: we cannot await during unload. The request is well under 64 KB
        // (trimmed above) and keepalive: true is requested so it survives page teardown.
        void this.handleSendEvents({ url: exitUrl, method: 'POST', headers, body: payload, keepalive: true }).catch(
          (e) => {
            // best effort on exit, but still surface the failure so it's diagnosable in logs.
            this.loggerProvider.warn('Custom transport failed to send session replay exit batch:', e);
          },
        );
      } catch (e) {
        this.loggerProvider.warn('Custom transport threw while sending session replay exit batch:', e);
      }
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
      // A throttle merge already coalesces by identity; clear the drain flag too so the
      // same backlog isn't passed through a redundant second merge on a later flush.
      this.coalesceNextFlush = false;
      list = this.mergeQueueAfterThrottle(list);
    } else if (this.coalesceNextFlush) {
      this.coalesceNextFlush = false;
      list = this.mergeDrainBacklog(list);
    }

    for (const context of list) {
      await this.send(context, useRetry);
    }
  }

  /**
   * Post-throttle release path: coalesce the queued contexts, then log once per pause window.
   * Delegates the actual merging to the shared coalesceByIdentity helper so the drain path
   * (mergeDrainBacklog) and this path stay byte-for-byte identical in how they merge.
   */
  private mergeQueueAfterThrottle(list: SessionReplayDestinationContext[]): SessionReplayDestinationContext[] {
    const merged = this.coalesceByIdentity(list);
    if (merged.length < list.length && !this.mergeLogFiredThisPause) {
      this.mergeLogFiredThisPause = true;
      this.loggerProvider.log(
        `Session replay throttle pause ended; merged ${list.length} queued batches into ${merged.length} request(s)`,
      );
    }
    return merged;
  }

  /**
   * Page-load backlog drain path: on init the SDK replays every persisted sequence
   * from a prior session via sendStoredEvents. Enqueued back-to-back they would flush as N
   * separate POSTs — a request flood on page load that feeds volume spikes and throttling.
   * Reuses the exact same identity-grouped merge as the post-throttle path so the backlog
   * collapses into far fewer requests, with onComplete fanned out so each source IDB record
   * is still cleaned up exactly once on success.
   */
  private mergeDrainBacklog(list: SessionReplayDestinationContext[]): SessionReplayDestinationContext[] {
    const merged = this.coalesceByIdentity(list);
    if (merged.length < list.length) {
      this.loggerProvider.log(
        `Session replay coalesced ${list.length} persisted page-load backlog batches into ${merged.length} request(s)`,
      );
    }
    return merged;
  }

  /**
   * Coalesces queued contexts that share the same destination identity into fewer requests.
   * Identity covers everything that affects the request URL, routing, or per-request semantics
   * — splitting on any difference keeps each merged POST indistinguishable from the source
   * contexts it replaced.
   *
   * Greedy concat with a soft byte-length cap (`MERGE_AFTER_THROTTLE_SOFT_CAP`) keeps merged
   * payloads well under the 413 ceiling; on the rare oversized merge, the existing
   * split-and-retry path still bisects safely.
   *
   * The merged context's `onComplete` fans out to every source context's callback so each
   * underlying IDB sequence record is cleaned up exactly once on success.
   */
  private coalesceByIdentity(list: SessionReplayDestinationContext[]): SessionReplayDestinationContext[] {
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
      let currentBytes = 0;
      const flushCurrent = () => {
        if (current) merged.push(current);
        current = null;
        currentBytes = 0;
      };
      for (const ctx of group) {
        // UTF-8 byte size, matching how the events store enforces MAX_EVENT_LIST_SIZE
        // (see base-events-store.ts:getStringSize). Using char length would let a CJK/
        // emoji-heavy payload sneak past the cap.
        const ctxBytes = ctx.events.reduce((sum, e) => sum + new Blob([e]).size, 0);
        if (current === null) {
          // Reset attempts to 0 on the merged context so the post-throttle delivery gets a
          // full retry budget. The throttle pause has already absorbed back-pressure; the
          // alternative (Math.max of source attempts) would collapse N source budgets into
          // one and end-of-life all N IDB records on a single retry exhaustion.
          current = { ...ctx, events: [...ctx.events], attempts: 0 };
          currentBytes = ctxBytes;
          continue;
        }
        if (currentBytes + ctxBytes > MERGE_AFTER_THROTTLE_SOFT_CAP) {
          flushCurrent();
          current = { ...ctx, events: [...ctx.events], attempts: 0 };
          currentBytes = ctxBytes;
          continue;
        }
        const prevOnComplete = current.onComplete;
        const ctxOnComplete = ctx.onComplete;
        current.events = current.events.concat(ctx.events);
        currentBytes += ctxBytes;
        current.onComplete = async () => {
          // allSettled (not all): an underlying store cleanup failure in one shouldn't
          // block the other, and the merged onComplete is invoked fire-and-forget via
          // `void context.onComplete()` — a rejection from `Promise.all` would surface
          // as an unhandled rejection. Errors stay encapsulated in the source callbacks.
          await Promise.allSettled([prevOnComplete(), ctxOnComplete()]);
        };
      }
      flushCurrent();
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
      // The worker only resolves this promise when it posts back complete/payload_too_large.
      // If the worker's own fetch hangs, no message ever arrives, so this promise — and the
      // serial flush loop awaiting it — would hang forever while pendingWorkerRequests grows
      // unbounded. On timeout we resolve so flush() proceeds, but deliberately do NOT call
      // completeRequest: like the worker-crash path above, the events were never confirmed
      // delivered, so onComplete must not fire and the IDB/memory store must stay intact for
      // recovery by sendStoredEvents.
      // sendTimeoutMs <= 0 disables the wait timer entirely: we then rely solely on the
      // worker's own complete/payload_too_large message to settle. This reintroduces the
      // hang risk this timer guards against, so it is an explicit experiment opt-out.
      const timeout =
        this.sendTimeoutMs > 0
          ? setTimeout(() => {
              const pending = this.pendingWorkerRequests.get(id);
              if (!pending) return;
              this.pendingWorkerRequests.delete(id);
              // Retain the context so a *late* worker complete/payload_too_large can still settle the
              // store record (see timedOutWorkerRequests). Without this, a worker that ultimately
              // delivers after we stopped awaiting would leave the record behind → duplicate upload.
              this.rememberTimedOutRequest(id, pending.context);
              this.loggerProvider.warn(
                `Session replay worker send timed out after ${this.sendTimeoutMs}ms; leaving events for retry`,
              );
              pending.resolve();
            }, this.sendTimeoutMs)
          : undefined;
      this.pendingWorkerRequests.set(id, { context, resolve, timeout });
      worker.postMessage({
        type: 'send',
        id,
        payload,
        useRetry,
        // Tell the worker to delegate each network attempt back to the main thread, where the
        // custom transport callback lives (functions can't cross postMessage). Absent/false
        // keeps the worker's own internal fetch — the unchanged path for existing integrations.
        useCustomTransport: !!this.handleSendEvents,
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
          enableTransportCompression: this.enableTransportCompression,
          sendTimeoutMs: this.sendTimeoutMs,
        },
      });
    });
  }

  private rememberTimedOutRequest(id: string, context: SessionReplayDestinationContext) {
    this.timedOutWorkerRequests.set(id, context);
    // Bound memory: a wedged worker that never replies must not let this grow without limit.
    // Map preserves insertion order, so deleting the first key evicts the oldest entry.
    if (this.timedOutWorkerRequests.size > MAX_TIMED_OUT_WORKER_REQUESTS) {
      for (const oldest of this.timedOutWorkerRequests.keys()) {
        this.timedOutWorkerRequests.delete(oldest);
        break;
      }
    }
  }

  // Runs the custom transport on the main thread for a single attempt the worker delegated,
  // then posts the result back into the worker's retry loop as a 'fetch-response'. We read only
  // what the worker's status handling needs: the skip header on a 2xx and the body text on a
  // 413 (for WAF detection). A thrown/rejected transport is reported as an error so the worker
  // surfaces it the same way a thrown fetch would (no retry) — matching the main-thread path.
  private async handleDelegatedFetch(worker: Worker, msg: WorkerFetchRequestMessage): Promise<void> {
    const { requestId, url, method, headers, body, keepalive } = msg;
    try {
      // In practice this.handleSendEvents is always set here: the worker only emits
      // 'fetch-request' when useCustomTransport (= !!this.handleSendEvents) was true. The
      // built-in fetch is a defensive fallback for the impossible case so we never accidentally
      // drop a delegated send; it is not a supported "run without a transport" path.
      let res: Response;
      if (this.handleSendEvents) {
        res = await this.handleSendEvents({ url, method, headers, body, keepalive });
      } else {
        // Defensive only: the worker emits 'fetch-request' solely when useCustomTransport is set,
        // so this branch shouldn't be reachable. Warn so a regression that delegates without a
        // transport is diagnosable rather than silently routing to the built-in fetch.
        this.loggerProvider.warn(
          'Delegated session replay fetch received without a custom transport configured; falling back to built-in fetch.',
        );
        res = await fetch(url, { method, headers, body, keepalive });
      }
      const status = res.status;
      let skipHeader: string | null = null;
      let responseBody = '';
      if (status >= 200 && status < 300) {
        skipHeader = res.headers?.get?.(EVENT_SKIPPED_HEADER) ?? null;
      }
      if (status === 413) {
        try {
          responseBody = await res.text();
        } catch {
          // best effort
        }
      }
      this.loggerProvider.debug(`Delegated session replay fetch (request ${requestId}) returned status ${status}.`);
      worker.postMessage({ type: 'fetch-response', requestId, status, skipHeader, body: responseBody });
    } catch (e) {
      this.loggerProvider.debug(`Delegated session replay fetch (request ${requestId}) failed:`, e);
      worker.postMessage({
        type: 'fetch-response',
        requestId,
        status: 0,
        skipHeader: null,
        body: String(e),
        error: true,
      });
    }
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
      // Only await gzip when (a) the customer hasn't opted out and (b) CompressionStream
      // is actually available; skipping the await entirely preserves the synchronous
      // fast-path for browsers/environments (e.g. Jest) that don't support it, keeping
      // retry-timing tests unaffected.
      const globalScope = getGlobalScope();
      const gzipped =
        this.enableTransportCompression && globalScope && 'CompressionStream' in globalScope
          ? await gzipJson(payloadJson, globalScope)
          : null;
      const payloadSize = gzipped ? gzipped.byteLength : new Blob([payloadJson]).size;
      // fetch() has no native timeout. A request stuck "pending" forever would block the
      // serial flush loop indefinitely (head-of-line blocking), so we abort it after
      // SEND_TIMEOUT_MS. The abort surfaces as an AbortError in the catch below, where it's
      // routed as a retryable network failure when useRetry is true.
      const controller = new AbortController();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: '*/*',
        Authorization: `Bearer ${apiKey}`,
        'X-Client-Version': version,
        'X-Client-Library': sessionReplayLibrary,
        'X-Client-Url': url.substring(0, MAX_URL_LENGTH), // limit url length to 1000 characters to avoid ELB 400 error
        'X-Client-Sample-Rate': `${sampleRate}`,
        'X-Sampling-Hash-Alg': 'xxhash32',
        ...(gzipped ? { 'Content-Encoding': 'gzip' } : {}),
      };
      const body: string | Uint8Array = gzipped ?? payloadJson;
      // keepalive lets the request survive page navigation, preventing 499 (client-closed) errors.
      // Must stay under the browser's 64 KB keepalive budget; large payloads skip it.
      const keepalive = payloadSize <= MAX_KEEPALIVE_BYTES;
      const options: RequestInit = {
        headers,
        body,
        method: 'POST',
        keepalive,
        signal: controller.signal,
      };

      const serverUrl = `${getServerUrl(context.serverZone, this.trackServerUrl)}?${urlParams.toString()}`;
      // Final defensive guard: never POST a zero-event payload. Upper layers (events-manager
      // oversize filter, send()'s post-batcher check, store-layer filters) should already
      // have caught this — but SR-4284 fleet logs show ~416 empty-body 400s/24h slipping
      // through somehow, so a cheap belt-and-braces check immediately before fetch prevents
      // any future regression from re-introducing the same server rejection.
      if (payload.events.length === 0) {
        this.completeRequest({ context });
        return;
      }
      // sendTimeoutMs <= 0 disables the abort: the request can then hang indefinitely
      // (head-of-line blocking the serial flush). Explicit experiment opt-out only.
      const sendTimeout =
        this.sendTimeoutMs > 0
          ? setTimeout(() => {
              controller.abort();
            }, this.sendTimeoutMs)
          : undefined;
      let res: Response;
      try {
        // When a custom transport is configured, hand it the fully-formed request and let it own
        // the network call (e.g. to attach a JWT and route through a proxy). Otherwise use the
        // built-in fetch. Retry/response handling below is identical for both paths. The built-in
        // fetch cancels directly on controller.signal; the custom callback can't be cancelled, so
        // we race it against the abort — a hung/never-settling transport then rejects with an
        // AbortError (retryable, like the worker delegation path) instead of blocking the serial
        // flush loop forever. The callback's own promise keeps running; we just stop awaiting it.
        res = this.handleSendEvents
          ? await abortable(
              this.handleSendEvents({ url: serverUrl, method: 'POST', headers, body, keepalive }),
              controller.signal,
            )
          : await fetch(serverUrl, options);
      } finally {
        // Clear on success and on error alike so a settled request never leaves an armed
        // timer that would abort a later reused controller or fire a stray callback.
        if (sendTimeout) clearTimeout(sendTimeout);
      }
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
      // A send timeout aborts the fetch, which rejects with an AbortError. Treat that as a
      // transient network failure and route it through the same retry budget/backoff as a
      // 5xx (so a single stalled request doesn't permanently drop the batch) when retries
      // are enabled. completeRequest fires onComplete exactly once via either branch
      // (handleOtherResponse only completes on retry exhaustion), so onComplete can't fire
      // twice. Non-abort errors keep the original complete-with-error behavior.
      // Browsers reject an aborted fetch with a DOMException named 'AbortError', which is NOT an
      // Error instance — an `instanceof Error` check would misroute every send-timeout abort to
      // the fatal completeRequest path, defeating the retry. Match on the name across any thrown
      // object (DOMException or Error) instead.
      const isAbort = !!e && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError';
      if (isAbort && useRetry) {
        await this.handleOtherResponse(context);
      } else {
        this.completeRequest({ context, err: e as string });
      }
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
