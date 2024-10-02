import { BaseTransport } from '@amplitude/analytics-core';
import { Logger as ILogger, Status } from '@amplitude/analytics-types';
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
import { KB_SIZE } from './constants';

export type PayloadBatcher = ({ version, events }: { version: number; events: string[] }) => {
  version: number;
  events: unknown[];
};

export class SessionReplayTrackDestination implements AmplitudeSessionReplayTrackDestination {
  loggerProvider: ILogger;
  storageKey = '';
  retryTimeout = 1000;
  private scheduled: ReturnType<typeof setTimeout> | null = null;
  payloadBatcher: PayloadBatcher;
  queue: SessionReplayDestinationContext[] = [];

  constructor({ loggerProvider, payloadBatcher }: { loggerProvider: ILogger; payloadBatcher?: PayloadBatcher }) {
    this.loggerProvider = loggerProvider;
    this.payloadBatcher = payloadBatcher ? payloadBatcher : (payload) => payload;
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
        err: `${MAX_RETRIES_EXCEEDED_MESSAGE}, batch sequence id, ${context.sequenceId}`,
      });
      return false;
    });
    tryable.forEach((context) => {
      this.queue = this.queue.concat(context);
      if (context.timeout === 0) {
        this.schedule(0);
        return;
      }

      setTimeout(() => {
        context.timeout = 0;
        this.schedule(0);
      }, context.timeout);
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
    const list: SessionReplayDestinationContext[] = [];
    const later: SessionReplayDestinationContext[] = [];
    this.queue.forEach((context) => (context.timeout === 0 ? list.push(context) : later.push(context)));
    this.queue = later;

    if (this.scheduled) {
      clearTimeout(this.scheduled);
      this.scheduled = null;
    }

    await Promise.all(list.map((context) => this.send(context, useRetry)));
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
      seq_number: `${context.sequenceId}`,
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
      const options: RequestInit = {
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          Authorization: `Bearer ${apiKey}`,
          'X-Client-Version': version,
          'X-Client-Library': sessionReplayLibrary,
          'X-Client-Url': url,
          'X-Client-Sample-Rate': `${sampleRate}`,
        },
        body: JSON.stringify(payload),
        method: 'POST',
      };
      const server_url = `${getServerUrl(context.serverZone)}?${urlParams.toString()}`;
      const res = await fetch(server_url, options);
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
        this.handleReponse(res.status, context);
      }
    } catch (e) {
      this.completeRequest({ context, err: e as string });
    }
  }

  handleReponse(status: number, context: SessionReplayDestinationContext) {
    const parsedStatus = new BaseTransport().buildStatus(status);
    switch (parsedStatus) {
      case Status.Success:
        this.handleSuccessResponse(context);
        break;
      case Status.Failed:
        this.handleOtherResponse(context);
        break;
      default:
        this.completeRequest({ context, err: UNEXPECTED_NETWORK_ERROR_MESSAGE });
    }
  }

  handleSuccessResponse(context: SessionReplayDestinationContext) {
    const sizeOfEventsList = Math.round(new Blob(context.events).size / KB_SIZE);
    this.completeRequest({
      context,
      success: `Session replay event batch with seq id ${context.sequenceId} tracked successfully for session id ${context.sessionId}, size of events: ${sizeOfEventsList} KB`,
    });
  }

  handleOtherResponse(context: SessionReplayDestinationContext) {
    this.addToQueue({
      ...context,
      timeout: context.attempts * this.retryTimeout,
    });
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
    void context.onComplete(context.sequenceId);
    if (err) {
      this.loggerProvider.warn(err);
    } else if (success) {
      this.loggerProvider.debug(success);
    }
  }
}
