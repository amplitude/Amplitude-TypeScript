import { AMPLITUDE_PREFIX, BaseTransport } from '@amplitude/analytics-core';
import { BrowserConfig, EnrichmentPlugin, Event, PluginType, Status } from '@amplitude/analytics-types';
import { get, update } from 'idb-keyval';
import { record } from 'rrweb';
import { shouldSplitEventsList } from './helpers';
import { MAX_RETRIES_EXCEEDED_MESSAGE, STORAGE_FAILURE, UNEXPECTED_ERROR_MESSAGE } from './messages';
import { Events, IDBStore, SessionReplayContext } from './typings/session-replay';

const SESSION_REPLAY_SERVER_URL = 'https://api-secure.amplitude.com/sessions/track';
const STORAGE_PREFIX = `${AMPLITUDE_PREFIX}_replay_unsent`;
export class SessionReplayPlugin implements EnrichmentPlugin {
  name = '@amplitude/plugin-session-replay';
  type = PluginType.ENRICHMENT as const;
  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;
  storageKey = '';
  retryTimeout = 1000;
  events: Events = [];
  currentSequenceId = 0;
  private scheduled: ReturnType<typeof setTimeout> | null = null;
  queue: SessionReplayContext[] = [];
  stopRecordingEvents: ReturnType<typeof record> | null = null;

  async setup(config: BrowserConfig) {
    config.loggerProvider.log('Installing @amplitude/plugin-session-replay.');

    this.config = config;
    this.storageKey = `${STORAGE_PREFIX}_${this.config.apiKey.substring(0, 10)}`;

    await this.emptyStoreAndReset();

    this.recordEvents();
  }

  execute(event: Event) {
    event.event_properties = {
      ...event.event_properties,
      session_replay_enabled: true,
    };

    if (event.event_type === 'session_start' && this.stopRecordingEvents) {
      this.stopRecordingEvents();
      this.recordEvents();
    } else if (event.event_type === 'session_end') {
      if (event.session_id) {
        this.sendEventsList({
          events: this.events,
          sequenceId: this.currentSequenceId,
          sessionId: event.session_id,
        });
      }
      this.events = [];
      this.currentSequenceId = 0;
    }
    return Promise.resolve(event);
  }

  async emptyStoreAndReset() {
    const storedReplaySessions = await this.getAllSessionEventsFromStore();
    if (storedReplaySessions) {
      for (const sessionId in storedReplaySessions) {
        const storedReplayEvents = storedReplaySessions[sessionId];
        if (storedReplayEvents.events.length) {
          this.sendEventsList({
            events: storedReplayEvents.events,
            sequenceId: storedReplayEvents.sequenceId,
            sessionId: parseInt(sessionId, 10),
          });
        }
      }
      this.events = [];
      const currentSessionStoredEvents = this.config.sessionId && storedReplaySessions[this.config.sessionId];
      this.currentSequenceId = currentSessionStoredEvents ? currentSessionStoredEvents.sequenceId + 1 : 0;
      this.storeEventsForSession([], this.currentSequenceId);
    }
  }

  recordEvents() {
    this.stopRecordingEvents = record({
      emit: (event) => {
        console.log('event', event);
        const eventString = JSON.stringify(event);
        const shouldSplit = shouldSplitEventsList(this.events, eventString);
        if (shouldSplit) {
          this.sendEventsList({
            events: this.events,
            sequenceId: this.currentSequenceId,
            sessionId: this.config.sessionId as number,
          });
          this.events = [];
          this.currentSequenceId++;
        }
        this.events.push(eventString);
        this.storeEventsForSession(this.events, this.currentSequenceId);
      },
    });
  }

  sendEventsList({ events, sequenceId, sessionId }: { events: string[]; sequenceId: number; sessionId: number }) {
    this.addToQueue({
      events,
      sequenceId,
      attempts: 0,
      timeout: 0,
      sessionId,
    });
  }

  addToQueue(...list: SessionReplayContext[]) {
    const tryable = list.filter((context) => {
      if (context.attempts < this.config.flushMaxRetries) {
        context.attempts += 1;
        return true;
      }
      // TODO: should we keep events in indexdb to retry on a refresh? Whats destination behavior?
      this.completeRequest({
        context,
        err: `${MAX_RETRIES_EXCEEDED_MESSAGE}, batch sequence id, ${context.sequenceId}`,
      });
      return false;
    });
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

    await Promise.all(list.map((context) => this.send(context, useRetry)));
  }

  async send(context: SessionReplayContext, useRetry = true) {
    const payload = {
      api_key: this.config.apiKey,
      device_id: this.config.deviceId,
      session_id: context.sessionId,
      start_timestamp: context.sessionId,
      events_batch: {
        version: 1,
        events: context.events,
        seq_number: context.sequenceId,
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
      if (res === null) {
        this.completeRequest({ context, err: UNEXPECTED_ERROR_MESSAGE, removeEvents: false });
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
        this.handleReponse(res, context);
      }
    } catch (e) {
      this.completeRequest({ context, err: e as string, removeEvents: false });
    }
  }

  handleReponse(res: Response, context: SessionReplayContext) {
    const { status } = res;
    const parsedStatus = new BaseTransport().buildStatus(status);
    switch (parsedStatus) {
      case Status.Success:
        this.handleSuccessResponse(res, context);
        break;
      default:
        this.handleOtherResponse(context);
    }
  }

  handleSuccessResponse(res: Response, context: SessionReplayContext) {
    this.completeRequest({ context, success: `${res.status}` });
  }

  handleOtherResponse(context: SessionReplayContext) {
    this.addToQueue({
      ...context,
      timeout: context.attempts * this.retryTimeout,
    });
  }

  async getAllSessionEventsFromStore() {
    try {
      const storedReplaySessionContexts: IDBStore | undefined = await get(this.storageKey);

      return storedReplaySessionContexts;
    } catch (e) {
      this.config.loggerProvider.error(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  }

  storeEventsForSession(events: Events, sequenceId: number) {
    try {
      void update(this.storageKey, (sessionMap: IDBStore | undefined): IDBStore => {
        if (this.config.sessionId) {
          return {
            ...sessionMap,
            [this.config.sessionId]: {
              events: events,
              sequenceId,
            },
          };
        }
        return sessionMap || {};
      });
    } catch (e) {
      this.config.loggerProvider.error(`${STORAGE_FAILURE}: ${e as string}`);
    }
  }

  removeSessionEventsStore(sessionId: number | undefined) {
    if (sessionId) {
      try {
        void update(this.storageKey, (sessionMap: IDBStore | undefined): IDBStore => {
          sessionMap = sessionMap || {};
          delete sessionMap[sessionId];
          return sessionMap;
        });
      } catch (e) {
        this.config.loggerProvider.error(`${STORAGE_FAILURE}: ${e as string}`);
      }
    }
  }

  completeRequest({
    context,
    err,
    success,
    removeEvents = true,
  }: {
    context: SessionReplayContext;
    err?: string;
    success?: string;
    removeEvents?: boolean;
  }) {
    removeEvents && this.removeSessionEventsStore(context.sessionId);
    if (err) {
      this.config.loggerProvider.error(err);
    } else if (success) {
      this.config.loggerProvider.log(success);
    }
  }
}
