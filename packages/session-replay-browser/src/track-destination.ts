import { encode } from '@msgpack/msgpack';
import { BaseTransport, ILogger, Status } from '@amplitude/analytics-core';
import { getCurrentUrl, getServerUrl } from './helpers';
import {
  MAX_RETRIES_EXCEEDED_MESSAGE,
  MISSING_API_KEY_MESSAGE,
  MISSING_DEVICE_ID_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
  UNEXPECTED_NETWORK_ERROR_MESSAGE,
} from './messages';
import {
  EventData,
  SessionReplayTrackDestination as AmplitudeSessionReplayTrackDestination,
  SessionReplayDestination,
  SessionReplayDestinationContext,
} from './typings/session-replay';
import { VERSION } from './version';
import { MAX_URL_LENGTH, KB_SIZE, MAX_MSGPACK_PAYLOAD_BYTES } from './constants';

export type PayloadBatcher = ({ version, events }: { version: number; events: EventData[] }) => {
  version: number;
  events: EventData[];
};

export class SessionReplayTrackDestination implements AmplitudeSessionReplayTrackDestination {
  loggerProvider: ILogger;
  storageKey = '';
  trackServerUrl?: string;
  retryTimeout = 1000;
  private scheduled: ReturnType<typeof setTimeout> | null = null;
  payloadBatcher: PayloadBatcher;
  useMessagePack: boolean;
  debugMode: boolean;
  queue: SessionReplayDestinationContext[] = [];

  constructor({
    trackServerUrl,
    loggerProvider,
    payloadBatcher,
    useMessagePack,
    debugMode,
  }: {
    trackServerUrl?: string;
    loggerProvider: ILogger;
    payloadBatcher?: PayloadBatcher;
    useMessagePack?: boolean;
    debugMode?: boolean;
  }) {
    this.loggerProvider = loggerProvider;
    this.payloadBatcher = payloadBatcher ? payloadBatcher : (payload) => payload;
    this.trackServerUrl = trackServerUrl;
    this.useMessagePack = useMessagePack ?? false;
    this.debugMode = debugMode ?? false;
  }

  sendEventsList(destinationData: SessionReplayDestination) {
    this.addToQueue({
      ...destinationData,
      attempts: 0,
      timeout: 0,
    });
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
    const url = getCurrentUrl();
    const version = VERSION;
    const sampleRate = context.sampleRate;
    const urlParams = new URLSearchParams({
      device_id: deviceId,
      session_id: `${context.sessionId}`,
      type: `${context.type}`,
    });
    const sessionReplayLibrary = `${context.version?.type || 'standalone'}/${context.version?.version || version}`;
    const payload = this.payloadBatcher({
      version: 1,
      events: context.events,
    });

    if (payload.events.length === 0) {
      this.completeRequest({ context });
      return;
    }

    try {
      const headers: Record<string, string> = {
        Accept: '*/*',
        Authorization: `Bearer ${apiKey}`,
        'X-Client-Version': version,
        'X-Client-Library': sessionReplayLibrary,
        'X-Client-Url': url.substring(0, MAX_URL_LENGTH), // limit url length to 1000 characters to avoid ELB 400 error
        'X-Client-Sample-Rate': `${sampleRate}`,
      };
      let contentType: string;
      let body: BodyInit;
      if (this.useMessagePack) {
        // Events are raw objects; msgpack-encode and gzip-compress the entire batch as one binary blob.
        const encoded = encode({ version: payload.version, events: payload.events });
        const { data: compressed, didCompress } = await this.gzipCompress(encoded);

        // Pre-emptive split: check encoded (pre-gzip) size. Jetty decompresses before the servlet
        // measures payload size, so we must compare against the uncompressed msgpack size, not
        // the wire size. Exceeding MAX_MSGPACK_PAYLOAD_BYTES would hit the backend's transcode path.
        if (encoded.byteLength > MAX_MSGPACK_PAYLOAD_BYTES && context.events.length > 1) {
          this.loggerProvider.debug(
            `[msgpack] encoded payload too large (${encoded.byteLength} bytes), splitting batch of ${context.events.length} events`,
          );
          this.splitAndRequeue(context);
          return;
        }

        if (this.debugMode) {
          this.loggerProvider.debug(
            `[msgpack] encoded: ${encoded.byteLength} bytes` +
              (didCompress
                ? `, compressed: ${compressed.byteLength} bytes`
                : ' (uncompressed, CompressionStream unavailable)') +
              `, first 64 bytes: [${compressed.slice(0, 64).join(', ')}]`,
          );
        }
        body = compressed;
        contentType = 'application/x-msgpack';
        if (didCompress) {
          headers['Content-Encoding'] = 'gzip';
        }
      } else {
        body = JSON.stringify(payload);
        contentType = 'application/json';
      }

      headers['Content-Type'] = contentType;
      const options: RequestInit = {
        headers,
        body,
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
    // Reactive split: a 413 means the payload was too large for the backend.
    // Split and re-queue if possible rather than retrying the same oversized request.
    if (status === 413 && context.events.length > 1) {
      this.loggerProvider.debug(
        `[msgpack] received 413, splitting batch of ${context.events.length} events and re-queuing`,
      );
      this.splitAndRequeue(context);
      return;
    }

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

  /**
   * Splits the batch in half and re-queues both halves as independent requests.
   * The original IDB record is cleaned up immediately since the events are already
   * in memory; sub-batches use a no-op onComplete so cleanup doesn't fire twice.
   */
  private splitAndRequeue(context: SessionReplayDestinationContext): void {
    const half = Math.floor(context.events.length / 2);
    const noop = async () => undefined;
    this.addToQueue(
      { ...context, events: context.events.slice(0, half), attempts: 0, timeout: 0, onComplete: noop },
      { ...context, events: context.events.slice(half), attempts: 0, timeout: 0, onComplete: noop },
    );
    void context.onComplete();
  }

  handleSuccessResponse(context: SessionReplayDestinationContext) {
    const stringEvents = context.events.filter((e): e is string => typeof e === 'string');
    const sizeOfEventsList = Math.round(new Blob(stringEvents).size / KB_SIZE);
    this.completeRequest({
      context,
      success: `Session replay event batch tracked successfully for session id ${context.sessionId}, size of events: ${sizeOfEventsList} KB`,
    });
  }

  async handleOtherResponse(context: SessionReplayDestinationContext) {
    const delay = context.attempts * this.retryTimeout;
    context.attempts++;
    if (context.attempts > (context.flushMaxRetries || 0)) {
      this.completeRequest({ context, err: MAX_RETRIES_EXCEEDED_MESSAGE });
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
    await this.send(context, true);
  }

  private async gzipCompress(data: Uint8Array): Promise<{ data: Uint8Array; didCompress: boolean }> {
    if (typeof CompressionStream === 'undefined') {
      // CompressionStream not available (older browsers); send uncompressed.
      return { data, didCompress: false };
    }
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    const reader = cs.readable.getReader() as ReadableStreamDefaultReader<Uint8Array>;
    await writer.write(data);
    await writer.close();
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLength = chunks.reduce((len, c) => len + c.length, 0);
    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return { data: out, didCompress: true };
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
