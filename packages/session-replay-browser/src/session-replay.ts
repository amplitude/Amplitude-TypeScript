import { getAnalyticsConnector, getGlobalScope } from '@amplitude/analytics-client-common';
import { Logger, returnWrapper } from '@amplitude/analytics-core';
import { Logger as ILogger } from '@amplitude/analytics-types';
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
  SESSION_REPLAY_DEBUG_PROPERTY,
  STORAGE_PREFIX,
  defaultSessionStore,
} from './constants';
import { generateHashCode, generateSessionReplayId, isSessionInSample, maskInputFn } from './helpers';
import { STORAGE_FAILURE } from './messages';
import { SessionReplayTrackDestination } from './track-destination';
import {
  AmplitudeSessionReplay,
  SessionReplayTrackDestination as AmplitudeSessionReplayTrackDestination,
  Events,
  IDBStore,
  IDBStoreSession,
  SessionReplayConfig as ISessionReplayConfig,
  RecordingStatus,
  SessionReplayOptions,
} from './typings/session-replay';

export class SessionReplay implements AmplitudeSessionReplay {
  name = '@amplitude/session-replay-browser';
  config: ISessionReplayConfig | undefined;
  trackDestination: AmplitudeSessionReplayTrackDestination;
  loggerProvider: ILogger;
  storageKey = '';
  events: Events = [];
  currentSequenceId = 0;
  stopRecordingEvents: ReturnType<typeof record> | null = null;
  maxPersistedEventsSize = MAX_EVENT_LIST_SIZE_IN_BYTES;
  interval = MIN_INTERVAL;
  timeAtLastSend: number | null = null;

  constructor() {
    this.loggerProvider = new Logger();
    this.trackDestination = new SessionReplayTrackDestination({ loggerProvider: this.loggerProvider });
  }

  init(apiKey: string, options: SessionReplayOptions) {
    return returnWrapper(this._init(apiKey, options));
  }

  protected async _init(apiKey: string, options: SessionReplayOptions) {
    this.config = new SessionReplayConfig(apiKey, options);
    this.loggerProvider = this.config.loggerProvider;
    this.trackDestination.setLoggerProvider(this.loggerProvider);

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

  setSessionId(sessionId: number, deviceId?: string) {
    if (!this.config) {
      this.loggerProvider.error('Session replay init has not been called, cannot set session id.');
      return;
    }

    if (deviceId) {
      this.config.deviceId = deviceId;
    }
    // use a consistent device id.
    const deviceIdForReplayId = this.getDeviceId();
    if (sessionId && deviceIdForReplayId) {
      this.config.sessionReplayId = generateSessionReplayId(sessionId, deviceIdForReplayId);
    } else {
      this.loggerProvider.error('Must provide either session replay id or session id when starting a new session.');
      return;
    }

    this.stopRecordingAndSendEvents(this.config.sessionId);
    this.config.sessionId = sessionId;
    this.events = [];
    this.currentSequenceId = 0;
    this.recordEvents();
  }

  getSessionReplayDebugPropertyValue() {
    let apiKeyHash = '';
    if (this.config) {
      apiKeyHash = generateHashCode(this.config.apiKey).toString();
    }
    return JSON.stringify({
      appHash: apiKeyHash,
    });
  }

  getSessionReplayProperties() {
    if (!this.config) {
      this.loggerProvider.error('Session replay init has not been called, cannot get session recording properties.');
      return {};
    }

    // If the user is in debug mode, ignore the focus handler when tagging events.
    // this is a common mishap when someone is developing locally and not seeing events getting tagged.
    const ignoreFocus = !!this.config.debugMode;
    const shouldRecord = this.getShouldRecord(ignoreFocus);

    if (shouldRecord) {
      const eventProperties = {
        [DEFAULT_SESSION_REPLAY_PROPERTY]: this.config.sessionReplayId ? this.config.sessionReplayId : null,
      };
      if (this.config.debugMode) {
        eventProperties[SESSION_REPLAY_DEBUG_PROPERTY] = this.getSessionReplayDebugPropertyValue();
      }
      return eventProperties;
    }

    return {};
  }

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

  getShouldRecord(ignoreFocus = false) {
    if (!this.config) {
      this.loggerProvider.error(`Session is not being recorded due to lack of config, please call sessionReplay.init.`);
      return false;
    }
    const globalScope = getGlobalScope();
    if (!ignoreFocus && globalScope && globalScope.document && !globalScope.document.hasFocus()) {
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
    }

    const isInSample = isSessionInSample(this.config.sessionId, this.getSampleRate());
    if (!isInSample) {
      this.loggerProvider.log(`Opting session ${this.config.sessionId} out of recording due to sample rate.`);
    }
    return isInSample;
  }

  getBlockSelectors(): string | string[] | undefined {
    return this.config?.privacyConfig?.blockSelector;
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

        if (seq.events && seq.events.length && seq.status === RecordingStatus.RECORDING) {
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
        if (shouldSplit && this.config) {
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
      // rrweb only exposes array type through its types, but arrays are also be supported. #class, ['#class', 'id']
      blockSelector: this.getBlockSelectors() as string,
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
    if (!this.config) {
      this.loggerProvider.error(`Session is not being recorded due to lack of config, please call sessionReplay.init.`);
      return;
    }
    this.trackDestination.sendEventsList({
      events: events,
      sequenceId: sequenceId,
      sessionId: sessionId,
      flushMaxRetries: this.config.flushMaxRetries,
      apiKey: this.config.apiKey,
      deviceId: this.getDeviceId(),
      sampleRate: this.getSampleRate(),
      serverZone: this.config.serverZone,
      onComplete: this.cleanUpSessionEventsStore.bind(this),
    });
  }

  getSampleRate() {
    return this.config?.sampleRate || DEFAULT_SAMPLE_RATE;
  }

  getDeviceId() {
    let identityStoreDeviceId: string | undefined;
    if (this.config?.instanceName) {
      const identityStore = getAnalyticsConnector(this.config.instanceName).identityStore;
      identityStoreDeviceId = identityStore.getIdentity().deviceId;
    }

    return identityStoreDeviceId || this.config?.deviceId;
  }

  getSessionId() {
    return this.config?.sessionId;
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

  async flush(useRetry = false) {
    if (this.trackDestination) {
      return this.trackDestination.flush(useRetry);
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
