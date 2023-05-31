import { BaseTransport } from '@amplitude/analytics-core';
import { BrowserConfig, EnrichmentPlugin, Event, PluginType, Status } from '@amplitude/analytics-types';
import { record } from 'rrweb';
import { shouldSplitEventsList } from './helpers';
import { MAX_RETRIES_EXCEEDED_MESSAGE, MISSING_API_KEY_MESSAGE, UNEXPECTED_ERROR_MESSAGE } from './messages';
import { SessionReplayContext } from './typings/session-replay';

export const SESSION_REPLAY_SERVER_URL = 'https://api2.amplitude.com/sessions/track';

export class SessionReplayPlugin implements EnrichmentPlugin {
  name = '@amplitude/plugin-session-replay';
  type = PluginType.ENRICHMENT as const;
  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;
  retryTimeout = 1000;
  events: string[][] = [];
  private scheduled: ReturnType<typeof setTimeout> | null = null;
  queue: SessionReplayContext[] = [];

  async setup(config: BrowserConfig) {
    console.log('setup called', config);
    this.events = [[]];
    this.config = config;

    config.loggerProvider.log('Installing @amplitude/plugin-session-replay.');
  }

  async execute(event: Event) {
    // todo: this should be a constant/type
    if (event.event_type === 'session_start') {
      this.events = [[]];
      console.log('starting new session', this.events);
      record({
        emit: (event) => {
          const eventString = JSON.stringify(event);
          const shouldSplit = shouldSplitEventsList(this.events[this.events.length - 1], eventString);
          if (shouldSplit) {
            this.sendEventsList(this.events[this.events.length - 1], this.events.length - 1);
            this.events.push([]);
          }
          this.events[this.events.length - 1].push(eventString);
        },
        maskAllInputs: true,
      });
    } else if (event.event_type === 'session_end' && this.events.length) {
      console.log('ending session', this.events);
      this.sendEventsList(this.events[this.events.length - 1], this.events.length - 1);
    }

    return event;
  }

  sendEventsList(events: string[], index: number) {
    try {
      this.addToQueue({
        events,
        index,
        attempts: 0,
        timeout: 0,
      });
    } catch (e) {
      this.config.loggerProvider.error(e);
    }
  }

  addToQueue(...list: SessionReplayContext[]) {
    const tryable = list.filter((context) => {
      if (context.attempts < this.config.flushMaxRetries) {
        context.attempts += 1;
        return true;
      }
      throw new Error(`${MAX_RETRIES_EXCEEDED_MESSAGE}, batch index, ${context.index}`);
    });
    console.log('tryable items', tryable);
    tryable.forEach((context) => {
      this.queue = this.queue.concat(context);
      if (context.timeout === 0) {
        this.schedule(this.config.flushIntervalMillis);
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
    const list: SessionReplayContext[] = [];
    const later: SessionReplayContext[] = [];
    this.queue.forEach((context) => (context.timeout === 0 ? list.push(context) : later.push(context)));
    this.queue = later;

    if (this.scheduled) {
      clearTimeout(this.scheduled);
      this.scheduled = null;
    }

    // const batches = chunk(list, this.config.flushQueueSize); // todo do we need to chunk
    try {
      await Promise.all(list.map((context) => this.send(context, useRetry)));
    } catch (e) {
      this.config.loggerProvider.error(e);
    }
  }

  async send(context: SessionReplayContext, useRetry = true) {
    if (!this.config.apiKey) {
      return Promise.reject(new Error(MISSING_API_KEY_MESSAGE));
    }
    const payload = {
      api_key: this.config.apiKey,
      device_id: this.config.deviceId,
      session_id: this.config.sessionId,
      start_timestamp: this.config.sessionId,
      events_batch: {
        version: 1,
        events: context.events,
        seq_number: context.index,
      },
    };
    try {
      const options: RequestInit = {
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
        },
        body: JSON.stringify(payload),
        method: 'POST',
      };
      const res = await fetch(SESSION_REPLAY_SERVER_URL, options);
      console.log('res', res);
      if (res === null) {
        return Promise.reject(new Error(UNEXPECTED_ERROR_MESSAGE));
      }
      if (!useRetry) {
        let responseBody = '';
        try {
          responseBody = JSON.stringify(res.body, null, 2);
        } catch {
          // to avoid crash, but don't care about the error, add comment to avoid empty block lint error
        }
        return Promise.resolve(`${res.status}: ${responseBody}`);
      }
      return this.handleReponse(res, context);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  async handleReponse(res: Response, context: SessionReplayContext) {
    const { status } = res;
    const parsedStatus = new BaseTransport().buildStatus(status);
    switch (parsedStatus) {
      case Status.Success:
        return this.handleSuccessResponse(res);
        break;

      default:
        return this.handleOtherResponse(context);
    }
  }

  async handleSuccessResponse(res: Response) {
    return Promise.resolve(`${res.status}`);
  }

  async handleOtherResponse(context: SessionReplayContext) {
    try {
      this.addToQueue({
        ...context,
        timeout: context.attempts * this.retryTimeout,
      });
    } catch (e) {
      return Promise.reject(new Error(e as string));
    }
    return Promise.resolve(`Retrying batch at index ${context.index}`);
  }
}
