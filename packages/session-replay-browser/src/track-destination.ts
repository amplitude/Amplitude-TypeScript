import { BaseTransport } from '@amplitude/analytics-core';
import { Logger as ILogger, ServerZone, Status } from '@amplitude/analytics-types';
import {
  SESSION_REPLAY_EU_URL as SESSION_REPLAY_EU_SERVER_URL,
  SESSION_REPLAY_SERVER_URL,
  SESSION_REPLAY_STAGING_URL as SESSION_REPLAY_STAGING_SERVER_URL,
} from './constants';
import { getCurrentUrl } from './helpers';
import {
  MAX_RETRIES_EXCEEDED_MESSAGE,
  MISSING_API_KEY_MESSAGE,
  MISSING_DEVICE_ID_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
  UNEXPECTED_NETWORK_ERROR_MESSAGE,
  getSuccessMessage,
} from './messages';
import {
  SessionReplayTrackDestination as AmplitudeSessionReplayTrackDestination,
  SessionReplayDestination,
  SessionReplayDestinationContext,
} from './typings/session-replay';
import { VERSION } from './version';

export class SessionReplayTrackDestination implements AmplitudeSessionReplayTrackDestination {
  loggerProvider: ILogger;
  storageKey = '';
  retryTimeout = 1000;
  private scheduled: ReturnType<typeof setTimeout> | null = null;
  queue: SessionReplayDestinationContext[] = [];

  constructor({ loggerProvider }: { loggerProvider: ILogger }) {
    this.loggerProvider = loggerProvider;
  }

  sendEventsList(destinationData: SessionReplayDestination) {
    this.addToQueue({
      ...destinationData,
      attempts: 0,
      timeout: 0,
    });
  }

  getServerUrl(serverZone?: keyof typeof ServerZone) {
    if (serverZone === ServerZone.STAGING) {
      return SESSION_REPLAY_STAGING_SERVER_URL;
    }

    if (serverZone === ServerZone.EU) {
      return SESSION_REPLAY_EU_SERVER_URL;
    }

    return SESSION_REPLAY_SERVER_URL;
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
      // Prevent duplicates from being added to the queue
      if (this.queue.findIndex((qContext) => qContext.sequenceId === context.sequenceId) !== -1) {
        return;
      }
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
    this.queue.filter(
      (context, index, q) => q.findIndex((context2) => context2.sequenceId === context.sequenceId) === index,
    );
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
    });

    const payload = {
      version: 1,
      events: context.events,
    };

    try {
      const options: RequestInit = {
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          Authorization: `Bearer ${apiKey}`,
          'X-Client-Version': version,
          'X-Client-Url': url,
          'X-Client-Sample-Rate': `${sampleRate}`,
        },
        body: JSON.stringify(payload),
        method: 'POST',
      };
      const server_url = `${this.getServerUrl(context.serverZone)}?${urlParams.toString()}`;
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
    this.completeRequest({ context, success: getSuccessMessage(context.sessionId) });
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
      this.loggerProvider.log(success);
    }
  }
}
