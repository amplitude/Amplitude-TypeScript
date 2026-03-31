import { BaseTransport, getGlobalScope, ILogger, ServerZone, Status } from '@amplitude/analytics-core';
import { getCurrentUrl, getServerUrl } from './helpers';
import {
  MAX_RETRIES_EXCEEDED_MESSAGE,
  MISSING_API_KEY_MESSAGE,
  MISSING_DEVICE_ID_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
  UNEXPECTED_NETWORK_ERROR_MESSAGE,
} from './messages';
import {
  SessionReplayTrackDestination as AmplitudeSessionReplayTrackDestination,
  SessionReplayDestination,
  SessionReplayDestinationContext,
} from './typings/session-replay';
import { VERSION } from './version';
import { MAX_URL_LENGTH, KB_SIZE } from './constants';

interface WorkerCompleteMessage {
  type: 'complete';
  id: string;
  err?: string;
}
interface WorkerLogMessage {
  type: 'log' | 'warn';
  id: string;
  message: string;
}
type WorkerMessage = WorkerCompleteMessage | WorkerLogMessage;

export type PayloadBatcher = ({ version, events }: { version: number; events: string[] }) => {
  version: number;
  events: unknown[];
};

/**
 * Gzip-compresses a JSON string using the CompressionStream API.
 * The caller is responsible for verifying that globalScope has CompressionStream.
 * Returns null if compression fails for any reason.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gzipJson(jsonStr: string, globalScope: any): Promise<Uint8Array | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const CS = globalScope.CompressionStream as typeof CompressionStream;
    const stream = new CS('gzip');
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();

    // Read concurrently with write+close. CompressionStream applies back-pressure:
    // close() blocks until all compressed output is consumed, so the reader must
    // run in parallel or close() will deadlock waiting for the readable side to drain.
    const chunks: Uint8Array[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const readPromise: Promise<void> = (async () => {
      for (;;) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const { done, value } = await reader.read();
        if (done) break;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        chunks.push(value);
      }
    })();

    await writer.write(new TextEncoder().encode(jsonStr));
    await writer.close();
    await readPromise;

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } catch {
    return null;
  }
}

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
          loggerProvider.error('Track destination worker failed, falling back to main-thread sending:', e);
          worker.terminate();
          this.worker = undefined;
          // Resolve all pending requests so flush() doesn't hang
          for (const [, pending] of this.pendingWorkerRequests) {
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
          } else if (msg.type === 'complete') {
            const pending = this.pendingWorkerRequests.get(msg.id);
            if (pending) {
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
    const payload = JSON.stringify({ version: 2, events });
    const urlParams = new URLSearchParams({
      device_id: deviceId,
      session_id: String(sessionId),
      type: 'replay',
      api_key: apiKey,
    });
    const serverUrl = `${getServerUrl(serverZone, this.trackServerUrl)}?${urlParams.toString()}`;
    const globalScope = getGlobalScope();
    try {
      globalScope?.navigator?.sendBeacon?.(serverUrl, payload);
    } catch {
      // Best effort — no fallback on page exit.
    }
  }

  addToQueue(...list: SessionReplayDestinationContext[]) {
    const tryable = list.filter((context) => {
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
    this.scheduled = setTimeout(() => {
      void this.flush(true).then(() => {
        if (this.queue.length > 0) {
          this.schedule(timeout);
        }
      });
    }, timeout);
  }

  async flush(useRetry = false) {
    const list = this.queue;
    this.queue = [];

    if (this.scheduled) {
      clearTimeout(this.scheduled);
      this.scheduled = null;
    }

    for (const context of list) {
      await this.send(context, useRetry);
    }
  }

  async send(context: SessionReplayDestinationContext, useRetry = true) {
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
      };

      const serverUrl = `${getServerUrl(context.serverZone, this.trackServerUrl)}?${urlParams.toString()}`;
      const res = await fetch(serverUrl, options);
      if (res === null) {
        this.completeRequest({ context, err: UNEXPECTED_ERROR_MESSAGE });
        return;
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
        await this.handleReponse(res.status, context);
      }
    } catch (e) {
      this.completeRequest({ context, err: e as string });
    }
  }

  async handleReponse(status: number, context: SessionReplayDestinationContext) {
    const parsedStatus = new BaseTransport().buildStatus(status);
    switch (parsedStatus) {
      case Status.Success:
        this.handleSuccessResponse(context);
        break;
      case Status.Failed:
        await this.handleOtherResponse(context);
        break;
      default:
        this.completeRequest({ context, err: UNEXPECTED_NETWORK_ERROR_MESSAGE });
    }
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
}
