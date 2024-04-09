import { MAX_EVENT_LIST_SIZE_IN_BYTES, MAX_INTERVAL, MIN_INTERVAL } from './constants';
import {
  SessionReplayEventsManager as AmplitudeSessionReplayEventsManager,
  SessionReplaySessionIDBStore as AmplitudeSessionReplayEventsStorage,
  SessionReplayTrackDestination as AmplitudeSessionReplayTrackDestination,
  Events,
  IDBStore,
  RecordingStatus,
  SessionReplayConfig,
} from './typings/session-replay';

import { SessionReplaySessionIDBStore } from './session-idb-store';
import { SessionReplayTrackDestination } from './track-destination';

export class SessionReplayEventsManager implements AmplitudeSessionReplayEventsManager {
  events: Events = [];
  currentSequenceId = 0;
  maxPersistedEventsSize = MAX_EVENT_LIST_SIZE_IN_BYTES;
  interval = MIN_INTERVAL;
  timeAtLastSend: number | null = null;
  sessionIDBStore: AmplitudeSessionReplayEventsStorage;
  trackDestination: AmplitudeSessionReplayTrackDestination;
  config: SessionReplayConfig;

  constructor({ config }: { config: SessionReplayConfig }) {
    this.config = config;
    this.trackDestination = new SessionReplayTrackDestination({ loggerProvider: this.config.loggerProvider });
    this.sessionIDBStore = new SessionReplaySessionIDBStore({
      loggerProvider: this.config.loggerProvider,
      apiKey: this.config.apiKey,
    });
  }

  async initialize({
    sessionId,
    deviceId,
    shouldSendStoredEvents = false,
  }: {
    sessionId: number;
    deviceId: string;
    shouldSendStoredEvents?: boolean;
  }) {
    this.timeAtLastSend = Date.now(); // Initialize this so we have a point of comparison when events are recorded
    const storedReplaySessions = await this.sessionIDBStore.getAllSessionDataFromStore();

    const storedSequencesForSession = storedReplaySessions && storedReplaySessions[sessionId];
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
      this.sendStoredEvents({ storedReplaySessions, deviceId, sessionId });
    }
  }

  sendStoredEvents({
    storedReplaySessions,
    sessionId,
    deviceId,
  }: {
    storedReplaySessions: IDBStore;
    sessionId: number;
    deviceId: string;
  }) {
    for (const storedSessionId in storedReplaySessions) {
      const storedSequences = storedReplaySessions[storedSessionId].sessionSequences;
      for (const storedSeqId in storedSequences) {
        const seq = storedSequences[storedSeqId];
        const numericSeqId = parseInt(storedSeqId, 10);
        const numericSessionId = parseInt(storedSessionId, 10);
        if (numericSessionId === sessionId && numericSeqId === this.currentSequenceId) {
          continue;
        }

        if (seq.events && seq.events.length && seq.status === RecordingStatus.RECORDING) {
          this.sendEventsList({
            events: seq.events,
            sequenceId: numericSeqId,
            sessionId: numericSessionId,
            deviceId,
          });
        }
      }
    }
  }

  resetSequence() {
    this.events = [];
    this.currentSequenceId = 0;
  }

  addEvent({ event, sessionId, deviceId }: { event: string; sessionId: number; deviceId: string }) {
    const shouldSplit = this.shouldSplitEventsList(event);
    if (shouldSplit) {
      this.sendEventsList({
        events: this.events,
        sequenceId: this.currentSequenceId,
        sessionId,
        deviceId,
      });
      this.events = [];
      this.currentSequenceId++;
    }
    this.events.push(event);
    void this.sessionIDBStore.storeEventsForSession(this.events, this.currentSequenceId, sessionId);
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

  sendEvents({ sessionId, deviceId }: { sessionId: number; deviceId: string }) {
    if (this.events.length && sessionId) {
      this.sendEventsList({
        events: this.events,
        sequenceId: this.currentSequenceId,
        sessionId,
        deviceId,
      });
    }
  }

  sendEventsList({
    events,
    sequenceId,
    sessionId,
    deviceId,
  }: {
    events: string[];
    sequenceId: number;
    sessionId: number;
    deviceId: string;
  }) {
    this.trackDestination.sendEventsList({
      events: events,
      sequenceId: sequenceId,
      sessionId: sessionId,
      flushMaxRetries: this.config.flushMaxRetries,
      apiKey: this.config.apiKey,
      deviceId: deviceId,
      sampleRate: this.config.sampleRate,
      serverZone: this.config.serverZone,
      onComplete: this.sessionIDBStore.cleanUpSessionEventsStore.bind(this.sessionIDBStore),
    });
  }

  async flush(useRetry = false) {
    if (this.trackDestination) {
      return this.trackDestination.flush(useRetry);
    }
  }
}
