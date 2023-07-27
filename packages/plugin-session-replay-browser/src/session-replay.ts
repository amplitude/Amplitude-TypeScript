import { getGlobalScope } from '@amplitude/analytics-client-common';
import { BaseTransport } from '@amplitude/analytics-core';
import { BrowserConfig, Event, Status } from '@amplitude/analytics-types';
import * as IDBKeyVal from 'idb-keyval';
import { pack, record } from 'rrweb';
import {
  BLOCK_CLASS,
  DEFAULT_SESSION_END_EVENT,
  DEFAULT_SESSION_REPLAY_PROPERTY,
  DEFAULT_SESSION_START_EVENT,
  MASK_TEXT_CLASS,
  MAX_EVENT_LIST_SIZE_IN_BYTES,
  MAX_INTERVAL,
  MIN_INTERVAL,
  SESSION_REPLAY_SERVER_URL,
  STORAGE_PREFIX,
  defaultSessionStore,
} from './constants';
import { maskInputFn } from './helpers';
import { MAX_RETRIES_EXCEEDED_MESSAGE, STORAGE_FAILURE, UNEXPECTED_ERROR_MESSAGE, getSuccessMessage } from './messages';
import {
  Events,
  IDBStore,
  IDBStoreSession,
  RecordingStatus,
  SessionReplayContext,
  SessionReplayEnrichmentPlugin,
  SessionReplayOptions,
  SessionReplayPlugin,
} from './typings/session-replay';
class SessionReplay implements SessionReplayEnrichmentPlugin {
  name = '@amplitude/plugin-session-replay-browser';
  type = 'enrichment' as const;
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
  interval = MIN_INTERVAL;
  timeAtLastSend: number | null = null;
  options: SessionReplayOptions;
  shouldRecord = true;

  constructor(options?: SessionReplayOptions) {
    this.options = { ...options };
  }

  async setup(config: BrowserConfig) {
    config.loggerProvider.log('Installing @amplitude/plugin-session-replay.');

    this.config = config;
    this.config.sessionId = config.sessionId;
    this.storageKey = `${STORAGE_PREFIX}_${this.config.apiKey.substring(0, 10)}`;

    if (typeof config.defaultTracking === 'boolean') {
      if (config.defaultTracking === false) {
        config.defaultTracking = {
          pageViews: false,
          formInteractions: false,
          fileDownloads: false,
          sessions: true,
        };
      }
    } else {
      config.defaultTracking = {
        ...config.defaultTracking,
        sessions: true,
      };
    }

    await this.initialize(true);

    const GlobalScope = getGlobalScope();
    if (GlobalScope && GlobalScope.window) {
      GlobalScope.window.addEventListener('blur', () => {
        this.stopRecordingEvents && this.stopRecordingEvents();
        this.stopRecordingEvents = null;
      });
      GlobalScope.window.addEventListener('focus', () => {
        void this.initialize();
      });
    }
  }

  async execute(event: Event) {
    if (this.shouldRecord) {
      event.event_properties = {
        ...event.event_properties,
        [DEFAULT_SESSION_REPLAY_PROPERTY]: true,
      };
    }
    if (event.event_type === DEFAULT_SESSION_START_EVENT && !this.stopRecordingEvents) {
      this.setShouldRecord();
      this.recordEvents();
    } else if (event.event_type === DEFAULT_SESSION_END_EVENT) {
      if (event.session_id && this.events.length) {
        this.sendEventsList({
          events: this.events,
          sequenceId: this.currentSequenceId,
          sessionId: event.session_id,
        });
      }
      this.stopRecordingEvents && this.stopRecordingEvents();
      this.stopRecordingEvents = null;
      this.events = [];
      this.currentSequenceId = 0;
    }
    return Promise.resolve(event);
  }

  async initialize(shouldSendStoredEvents = false) {
    this.timeAtLastSend = Date.now(); // Initialize this so we have a point of comparison when events are recorded
    if (!this.config.sessionId) {
      return;
    }
    const storedReplaySessions = await this.getAllSessionEventsFromStore();
    const storedSequencesForSession = storedReplaySessions && storedReplaySessions[this.config.sessionId];
    if (storedReplaySessions && storedSequencesForSession && storedSequencesForSession.sessionSequences) {
      const storedSeqId = storedSequencesForSession.currentSequenceId;
      const lastSequence = storedSequencesForSession.sessionSequences[storedSeqId];
      if (lastSequence && lastSequence.status !== RecordingStatus.RECORDING) {
        this.currentSequenceId = storedSeqId + 1;
        this.events = [];
      } else {
        // Pick up recording where it was left off in another tab or window
        this.currentSequenceId = storedSeqId;
        this.events = lastSequence?.events || [];
      }
    }
    this.setShouldRecord(storedSequencesForSession);
    if (shouldSendStoredEvents && storedReplaySessions) {
      this.sendStoredEvents(storedReplaySessions);
    }
    if (!this.stopRecordingEvents) {
      this.recordEvents();
    }
  }

  setShouldRecord(sessionStore?: IDBStoreSession) {
    if (sessionStore?.shouldRecord === false) {
      this.shouldRecord = false;
    } else if (this.config.optOut) {
      this.shouldRecord = false;
    } else if (this.options && this.options.sampleRate) {
      this.shouldRecord = Math.random() < this.options.sampleRate;
    }

    this.config.sessionId && void this.storeShouldRecordForSession(this.config.sessionId, this.shouldRecord);
    if (!this.shouldRecord && this.config.sessionId) {
      this.config.loggerProvider.log(`Opting session ${this.config.sessionId} out of recording.`);
    }
  }

  sendStoredEvents(storedReplaySessions: IDBStore) {
    for (const sessionId in storedReplaySessions) {
      const storedSequences = storedReplaySessions[sessionId].sessionSequences;
      for (const storedSeqId in storedSequences) {
        const seq = storedSequences[storedSeqId];
        const numericSeqId = parseInt(storedSeqId, 10);
        const numericSessionId = parseInt(sessionId, 10);
        if (numericSessionId === this.config.sessionId && numericSeqId === this.currentSequenceId) {
          continue;
        }
        if (seq.events.length && seq.status === RecordingStatus.RECORDING) {
          this.sendEventsList({
            events: seq.events,
            sequenceId: numericSeqId,
            sessionId: numericSessionId,
          });
        }
      }
    }
  }

  recordEvents() {
    if (!this.shouldRecord) {
      return;
    }
    this.stopRecordingEvents = record({
      emit: (event) => {
        const GlobalScope = getGlobalScope();
        if (GlobalScope && GlobalScope.document && !GlobalScope.document.hasFocus()) {
          this.stopRecordingEvents && this.stopRecordingEvents();
          return;
        }
        const eventString = JSON.stringify(event);

        const shouldSplit = this.shouldSplitEventsList(eventString);
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
        void this.storeEventsForSession(this.events, this.currentSequenceId, this.config.sessionId as number);
      },
      packFn: pack,
      maskAllInputs: true,
      maskTextClass: MASK_TEXT_CLASS,
      blockClass: BLOCK_CLASS,
      maskInputFn,
    });
  }

  /**
   * Determines whether to send the events list to the backend and start a new
   * empty events list, based on the size of the list as well as the last time sent
   * @param nextEventString
   * @returns boolean
   */
  shouldSplitEventsList = (nextEventString: string): boolean => {
    const sizeOfNextEvent = new Blob([nextEventString]).size;
    const sizeOfEventsList = new Blob(this.events).size;
    if (sizeOfEventsList + sizeOfNextEvent >= this.maxPersistedEventsSize) {
      return true;
    }
    if (this.timeAtLastSend !== null && Date.now() - this.timeAtLastSend > this.interval && this.events.length) {
      this.interval = Math.min(MAX_INTERVAL, this.interval + MIN_INTERVAL);
      this.timeAtLastSend = Date.now();
      return true;
    }
    return false;
  };

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
    this.completeRequest({ context, success: getSuccessMessage(context.sessionId) });
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

  async storeEventsForSession(events: Events, sequenceId: number, sessionId: number) {
    try {
      await IDBKeyVal.update(this.storageKey, (sessionMap: IDBStore = {}): IDBStore => {
        const session: IDBStoreSession = sessionMap[sessionId] || { ...defaultSessionStore };
        session.currentSequenceId = sequenceId;

        const currentSequence = (session.sessionSequences && session.sessionSequences[sequenceId]) || {};

        currentSequence.events = events;
        currentSequence.status = RecordingStatus.RECORDING;

        return {
          ...sessionMap,
          [sessionId]: {
            ...session,
            sessionSequences: {
              ...session.sessionSequences,
              [sequenceId]: currentSequence,
            },
          },
        };
      });
    } catch (e) {
      this.config.loggerProvider.error(`${STORAGE_FAILURE}: ${e as string}`);
    }
  }

  async storeShouldRecordForSession(sessionId: number, shouldRecord: boolean) {
    try {
      await IDBKeyVal.update(this.storageKey, (sessionMap: IDBStore = {}): IDBStore => {
        const session: IDBStoreSession = sessionMap[sessionId] || { ...defaultSessionStore };
        session.shouldRecord = shouldRecord;

        return {
          ...sessionMap,
          [sessionId]: session,
        };
      });
    } catch (e) {
      this.config.loggerProvider.error(`${STORAGE_FAILURE}: ${e as string}`);
    }
  }

  async cleanUpSessionEventsStore(sessionId: number, sequenceId: number) {
    try {
      await IDBKeyVal.update(this.storageKey, (sessionMap: IDBStore = {}): IDBStore => {
        const session: IDBStoreSession = sessionMap[sessionId];
        const sequenceToUpdate = session?.sessionSequences && session.sessionSequences[sequenceId];
        if (!sequenceToUpdate) {
          return sessionMap;
        }

        sequenceToUpdate.events = [];
        sequenceToUpdate.status = RecordingStatus.SENT;

        Object.entries(session.sessionSequences).forEach(([storedSeqId, sequence]) => {
          const numericStoredSeqId = parseInt(storedSeqId, 10);
          if (sequence.status === RecordingStatus.SENT && sequenceId !== numericStoredSeqId) {
            delete session.sessionSequences[numericStoredSeqId];
          }
        });

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
    removeEvents && context.sessionId && this.cleanUpSessionEventsStore(context.sessionId, context.sequenceId);
    if (err) {
      this.config.loggerProvider.error(err);
    } else if (success) {
      this.config.loggerProvider.log(success);
    }
  }
}

export const sessionReplayPlugin: SessionReplayPlugin = (options?: SessionReplayOptions) => {
  return new SessionReplay(options);
};
