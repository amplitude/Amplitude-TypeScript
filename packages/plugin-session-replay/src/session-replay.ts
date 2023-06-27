import { AMPLITUDE_PREFIX, BaseTransport } from '@amplitude/analytics-core';
import { BrowserConfig, EnrichmentPlugin, Event, PluginType, Status } from '@amplitude/analytics-types';
import * as IDBKeyVal from 'idb-keyval';
import { pack, record } from 'rrweb';
import { DEFAULT_SESSION_END_EVENT, DEFAULT_SESSION_REPLAY_PROPERTY, DEFAULT_SESSION_START_EVENT } from './constants';
import { shouldSplitEventsList } from './helpers';
import { MAX_RETRIES_EXCEEDED_MESSAGE, STORAGE_FAILURE, SUCCESS_MESSAGE, UNEXPECTED_ERROR_MESSAGE } from './messages';
import { Events, IDBStore, SessionReplayContext } from './typings/session-replay';

const SESSION_REPLAY_SERVER_URL = 'https://api-secure.amplitude.com/sessions/track';
const STORAGE_PREFIX = `${AMPLITUDE_PREFIX}_replay_unsent`;
const PAYLOAD_ESTIMATED_SIZE_IN_BYTES_WITHOUT_EVENTS = 200; // derived by JSON stringifying an example payload without events
const MAX_EVENT_LIST_SIZE_IN_BYTES = 20 * 1000000 - PAYLOAD_ESTIMATED_SIZE_IN_BYTES_WITHOUT_EVENTS;

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
  maxPersistedEventsSize = MAX_EVENT_LIST_SIZE_IN_BYTES;

  async setup(config: BrowserConfig) {
    config.loggerProvider.log('Installing @amplitude/plugin-session-replay.');

    this.config = config;
    this.storageKey = `${STORAGE_PREFIX}_${this.config.apiKey.substring(0, 10)}`;
    void this.emptyStoreAndReset();
  }

  execute(event: Event) {
    event.event_properties = {
      ...event.event_properties,
      [DEFAULT_SESSION_REPLAY_PROPERTY]: true,
    };
    if (event.event_type === DEFAULT_SESSION_START_EVENT && this.stopRecordingEvents) {
      this.stopRecordingEvents();
      this.recordEvents();
    } else if (event.event_type === DEFAULT_SESSION_END_EVENT) {
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
    console.log('in empty store after await');
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
      void this.storeEventsForSession([], this.currentSequenceId);
      this.recordEvents();
    }
  }

  recordEvents() {
    this.stopRecordingEvents = record({
      emit: (event) => {
        const eventString = JSON.stringify(event);
        const shouldSplit = shouldSplitEventsList(this.events, eventString, this.maxPersistedEventsSize);
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
        void this.storeEventsForSession(this.events, this.currentSequenceId);
      },
      packFn: pack,
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
      this.completeRequest({ context, err: e as string, removeEvents: false });
    }
  }

  handleReponse(status: number, context: SessionReplayContext) {
    const parsedStatus = new BaseTransport().buildStatus(status);
    switch (parsedStatus) {
      case Status.Success:
        this.handleSuccessResponse(context);
        break;
      default:
        this.handleOtherResponse(context);
    }
  }

  handleSuccessResponse(context: SessionReplayContext) {
    this.completeRequest({ context, success: SUCCESS_MESSAGE });
  }

  handleOtherResponse(context: SessionReplayContext) {
    this.addToQueue({
      ...context,
      timeout: context.attempts * this.retryTimeout,
    });
  }

  async getAllSessionEventsFromStore() {
    try {
      const storedReplaySessionContexts: IDBStore | undefined = await IDBKeyVal.get(this.storageKey);

      return storedReplaySessionContexts;
    } catch (e) {
      this.config.loggerProvider.error(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  }

  async storeEventsForSession(events: Events, sequenceId: number) {
    try {
      await IDBKeyVal.update(this.storageKey, (sessionMap: IDBStore | undefined): IDBStore => {
        return {
          ...sessionMap,
          ...(this.config.sessionId && {
            [this.config.sessionId]: {
              events: events,
              sequenceId,
            },
          }),
        };
      });
    } catch (e) {
      this.config.loggerProvider.error(`${STORAGE_FAILURE}: ${e as string}`);
    }
  }

  async removeSessionEventsStore(sessionId: number) {
    try {
      await IDBKeyVal.update(this.storageKey, (sessionMap: IDBStore = {}): IDBStore => {
        delete sessionMap[sessionId];
        return sessionMap;
      });
    } catch (e) {
      this.config.loggerProvider.error(`${STORAGE_FAILURE}: ${e as string}`);
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
    removeEvents && context.sessionId && this.removeSessionEventsStore(context.sessionId);
    if (err) {
      this.config.loggerProvider.error(err);
    } else if (success) {
      this.config.loggerProvider.log(success);
    }
  }
}
