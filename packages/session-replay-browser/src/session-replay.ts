import { getAnalyticsConnector, getGlobalScope } from '@amplitude/analytics-client-common';
import { BaseTransport, Logger, returnWrapper } from '@amplitude/analytics-core';
import { Logger as ILogger, ServerZone, Status } from '@amplitude/analytics-types';
import { pack, record } from '@amplitude/rrweb';
import * as IDBKeyVal from 'idb-keyval';
import { SessionReplayConfig } from './config';
import {
  BLOCK_CLASS,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_SESSION_REPLAY_PROPERTY,
  MASK_TEXT_CLASS,
  MAX_EVENT_LIST_SIZE_IN_BYTES,
  MAX_IDB_STORAGE_LENGTH,
  MAX_INTERVAL,
  MIN_INTERVAL,
  SESSION_REPLAY_EU_URL as SESSION_REPLAY_EU_SERVER_URL,
  SESSION_REPLAY_SERVER_URL,
  STORAGE_PREFIX,
  defaultSessionStore,
} from './constants';
import { getCurrentUrl, isSessionInSample, maskInputFn } from './helpers';
import {
  MAX_RETRIES_EXCEEDED_MESSAGE,
  MISSING_API_KEY_MESSAGE,
  MISSING_DEVICE_ID_MESSAGE,
  STORAGE_FAILURE,
  UNEXPECTED_ERROR_MESSAGE,
  UNEXPECTED_NETWORK_ERROR_MESSAGE,
  getSuccessMessage,
} from './messages';
import {
  AmplitudeSessionReplay,
  Events,
  IDBStore,
  IDBStoreSession,
  SessionReplayConfig as ISessionReplayConfig,
  RecordingStatus,
  SessionReplayContext,
  SessionReplayOptions,
} from './typings/session-replay';
import { VERSION } from './version';

export class SessionReplay implements AmplitudeSessionReplay {
  name = '@amplitude/session-replay-browser';
  config: ISessionReplayConfig | undefined;
  loggerProvider: ILogger;
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

  constructor() {
    this.loggerProvider = new Logger();
  }

  init(apiKey: string, options: SessionReplayOptions) {
    return returnWrapper(this._init(apiKey, options));
  }

  protected async _init(apiKey: string, options: SessionReplayOptions) {
    this.config = new SessionReplayConfig(apiKey, options);
    this.loggerProvider = this.config.loggerProvider;

    this.loggerProvider.log('Installing @amplitude/session-replay-browser.');

    this.storageKey = `${STORAGE_PREFIX}_${this.config.apiKey.substring(0, 10)}`;

    const globalScope = getGlobalScope();
    if (globalScope) {
      globalScope.addEventListener('blur', this.blurListener);
      globalScope.addEventListener('focus', this.focusListener);
    }

    if (globalScope && globalScope.document && globalScope.document.hasFocus()) {
      await this.initialize(true);
    }
  }

  setSessionId(sessionId: number) {
    if (!this.config) {
      this.loggerProvider.error('Session replay init has not been called, cannot set session id.');
      return;
    }
    this.stopRecordingAndSendEvents(this.config.sessionId);
    this.config.sessionId = sessionId;
    this.events = [];
    this.currentSequenceId = 0;
    this.recordEvents();
  }

  getSessionReplayProperties() {
    if (!this.config) {
      this.loggerProvider.error('Session replay init has not been called, cannot get session recording properties.');
      return {};
    }
    const shouldRecord = this.getShouldRecord();

    if (shouldRecord) {
      return {
        [DEFAULT_SESSION_REPLAY_PROPERTY]: true,
      };
    }

    return {};
  }

  getSessionRecordingProperties = () => {
    this.loggerProvider.warn('Please use getSessionReplayProperties instead of getSessionRecordingProperties.');

    return this.getSessionReplayProperties();
  };

  blurListener = () => {
    this.stopRecordingAndSendEvents();
  };
  focusListener = () => {
    void this.initialize();
  };

  stopRecordingAndSendEvents(sessionId?: number) {
    try {
      this.stopRecordingEvents && this.stopRecordingEvents();
      this.stopRecordingEvents = null;
    } catch (error) {
      const typedError = error as Error;
      this.loggerProvider.warn(`Error occurred while stopping recording: ${typedError.toString()}`);
    }
    const sessionIdToSend = sessionId || this.config?.sessionId;
    if (this.events.length && sessionIdToSend) {
      this.sendEventsList({
        events: this.events,
        sequenceId: this.currentSequenceId,
        sessionId: sessionIdToSend,
      });
    }
  }

  async initialize(shouldSendStoredEvents = false) {
    this.timeAtLastSend = Date.now(); // Initialize this so we have a point of comparison when events are recorded
    if (!this.config?.sessionId) {
      this.loggerProvider.warn(`Session is not being recorded due to lack of session id.`);
      return;
    }
    const storedReplaySessions = await this.getAllSessionEventsFromStore();
    // This resolves a timing issue when focus is fired multiple times in short succession,
    // we only want the rest of this function to run once. We can be sure that initialize has
    // already been called if this.stopRecordingEvents is defined
    if (this.stopRecordingEvents) {
      return;
    }
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
    if (shouldSendStoredEvents && storedReplaySessions) {
      this.sendStoredEvents(storedReplaySessions);
    }
    this.recordEvents();
  }

  shouldOptOut() {
    let identityStoreOptOut: boolean | undefined;
    if (this.config?.instanceName) {
      const identityStore = getAnalyticsConnector(this.config.instanceName).identityStore;
      identityStoreOptOut = identityStore.getIdentity().optOut;
    }

    return identityStoreOptOut !== undefined ? identityStoreOptOut : this.config?.optOut;
  }

  getShouldRecord() {
    if (!this.config) {
      this.loggerProvider.error(`Session is not being recorded due to lack of config, please call sessionReplay.init.`);
      return false;
    }
    const globalScope = getGlobalScope();
    if (globalScope && globalScope.document && !globalScope.document.hasFocus()) {
      if (this.config.sessionId) {
        this.loggerProvider.log(
          `Session ${this.config.sessionId} temporarily not recording due to lack of browser focus.`,
        );
      }
      return false;
    } else if (this.shouldOptOut()) {
      if (this.config.sessionId) {
        this.loggerProvider.log(`Opting session ${this.config.sessionId} out of recording due to optOut config.`);
      }
      return false;
    } else if (!this.config.sessionId) {
      this.loggerProvider.warn(`Session is not being recorded due to lack of session id.`);
      return false;
    } else if (this.config.sampleRate) {
      const isInSample = isSessionInSample(this.config.sessionId, this.config.sampleRate);
      if (!isInSample) {
        this.loggerProvider.log(`Opting session ${this.config.sessionId} out of recording due to sample rate.`);
      }
      return isInSample;
    }
    return true;
  }

  sendStoredEvents(storedReplaySessions: IDBStore) {
    for (const sessionId in storedReplaySessions) {
      const storedSequences = storedReplaySessions[sessionId].sessionSequences;
      for (const storedSeqId in storedSequences) {
        const seq = storedSequences[storedSeqId];
        const numericSeqId = parseInt(storedSeqId, 10);
        const numericSessionId = parseInt(sessionId, 10);
        if (numericSessionId === this.config?.sessionId && numericSeqId === this.currentSequenceId) {
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
    const shouldRecord = this.getShouldRecord();
    const sessionId = this.config?.sessionId;
    if (!shouldRecord || !sessionId) {
      return;
    }
    this.stopRecordingEvents = record({
      emit: (event) => {
        const globalScope = getGlobalScope();
        if ((globalScope && globalScope.document && !globalScope.document.hasFocus()) || !this.getShouldRecord()) {
          this.stopRecordingAndSendEvents();
          return;
        }
        const eventString = JSON.stringify(event);

        const shouldSplit = this.shouldSplitEventsList(eventString);
        if (shouldSplit) {
          this.sendEventsList({
            events: this.events,
            sequenceId: this.currentSequenceId,
            sessionId: sessionId,
          });
          this.events = [];
          this.currentSequenceId++;
        }
        this.events.push(eventString);
        void this.storeEventsForSession(this.events, this.currentSequenceId, sessionId);
      },
      packFn: pack,
      maskAllInputs: true,
      maskTextClass: MASK_TEXT_CLASS,
      blockClass: BLOCK_CLASS,
      maskInputFn,
      recordCanvas: false,
      errorHandler: (error) => {
        const typedError = error as Error;
        this.loggerProvider.warn('Error while recording: ', typedError.toString());

        return true;
      },
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
      if (context.attempts < (this.config?.flushMaxRetries || 0)) {
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

  getSampleRate() {
    return this.config?.sampleRate || DEFAULT_SAMPLE_RATE;
  }

  getServerUrl() {
    if (this.config?.serverZone === ServerZone.EU) {
      return SESSION_REPLAY_EU_SERVER_URL;
    }
    return SESSION_REPLAY_SERVER_URL;
  }

  getDeviceId() {
    let identityStoreDeviceId: string | undefined;
    if (this.config?.instanceName) {
      const identityStore = getAnalyticsConnector(this.config.instanceName).identityStore;
      identityStoreDeviceId = identityStore.getIdentity().deviceId;
    }

    return identityStoreDeviceId || this.config?.deviceId;
  }

  async send(context: SessionReplayContext, useRetry = true) {
    const apiKey = this.config?.apiKey;
    if (!apiKey) {
      return this.completeRequest({ context, err: MISSING_API_KEY_MESSAGE });
    }
    const deviceId = this.getDeviceId();
    if (!deviceId) {
      return this.completeRequest({ context, err: MISSING_DEVICE_ID_MESSAGE });
    }
    const url = getCurrentUrl();
    const version = VERSION;
    const sampleRate = this.getSampleRate();

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
      const server_url = `${this.getServerUrl()}?${urlParams.toString()}`;
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

  handleReponse(status: number, context: SessionReplayContext) {
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
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
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
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
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

        // Delete sent sequences for current session
        Object.entries(session.sessionSequences).forEach(([storedSeqId, sequence]) => {
          const numericStoredSeqId = parseInt(storedSeqId, 10);
          if (sequence.status === RecordingStatus.SENT && sequenceId !== numericStoredSeqId) {
            delete session.sessionSequences[numericStoredSeqId];
          }
        });

        // Delete any sessions that are older than 3 days
        Object.keys(sessionMap).forEach((sessionId: string) => {
          const numericSessionId = parseInt(sessionId, 10);
          if (Date.now() - numericSessionId >= MAX_IDB_STORAGE_LENGTH) {
            delete sessionMap[numericSessionId];
          }
        });

        return sessionMap;
      });
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
  }

  completeRequest({ context, err, success }: { context: SessionReplayContext; err?: string; success?: string }) {
    context.sessionId && this.cleanUpSessionEventsStore(context.sessionId, context.sequenceId);
    if (err) {
      this.loggerProvider.warn(err);
    } else if (success) {
      this.loggerProvider.log(success);
    }
  }

  shutdown() {
    const globalScope = getGlobalScope();
    if (globalScope) {
      globalScope.removeEventListener('blur', this.blurListener);
      globalScope.removeEventListener('focus', this.focusListener);
    }

    this.stopRecordingAndSendEvents();
  }
}
