import { Logger as ILogger } from '@amplitude/analytics-types';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { MAX_EVENT_LIST_SIZE_IN_BYTES, MAX_INTERVAL, MIN_INTERVAL } from './constants';
import { currentSequenceKey, sequencesToSendKey } from './idb-helpers';
import { STORAGE_FAILURE } from './messages';
import {
  SessionReplayEventsIDBStore as AmplitudeSessionReplayEventsIDBStore,
  Events,
  SendingSequencesIDBInput,
  SendingSequencesIDBReturn,
} from './typings/session-replay';

export interface SessionReplayDB extends DBSchema {
  sessionCurrentSequence: {
    key: number;
    value: {
      sessionId: number;
      events: Events;
    };
  };
  sequencesToSend: {
    key: number;
    value: SendingSequencesIDBInput;
    indexes: { sessionId: number };
  };
}

export const defineObjectStores = (db: IDBPDatabase<SessionReplayDB>) => {
  let sequencesStore;
  let currentSequenceStore;
  if (!db.objectStoreNames.contains(currentSequenceKey)) {
    currentSequenceStore = db.createObjectStore(currentSequenceKey, {
      keyPath: 'sessionId',
    });
  }
  if (!db.objectStoreNames.contains(sequencesToSendKey)) {
    sequencesStore = db.createObjectStore(sequencesToSendKey, {
      keyPath: 'sequenceId',
      autoIncrement: true,
    });
    sequencesStore.createIndex('sessionId', 'sessionId');
  }
  return {
    sequencesStore,
    currentSequenceStore,
  };
};

export const createStore = async (dbName: string) => {
  return await openDB<SessionReplayDB>(dbName, 1, {
    upgrade: defineObjectStores,
  });
};

export class SessionReplayEventsIDBStore implements AmplitudeSessionReplayEventsIDBStore {
  apiKey: string;
  db: IDBPDatabase<SessionReplayDB> | undefined;
  loggerProvider: ILogger;
  storageKey = '';
  maxPersistedEventsSize = MAX_EVENT_LIST_SIZE_IN_BYTES;
  interval = MIN_INTERVAL;
  timeAtLastSplit: number | null = null;

  constructor({ loggerProvider, apiKey }: { loggerProvider: ILogger; apiKey: string }) {
    this.loggerProvider = loggerProvider;
    this.apiKey = apiKey;
  }

  async initialize() {
    const dbName = `${this.apiKey.substring(0, 10)}_amp_session_replay_events`;
    this.db = await createStore(dbName);
    this.timeAtLastSplit = Date.now(); // Initialize this so we have a point of comparison when events are recorded
    // await transitionFromKeyValStore({ db: this.db, apiKey: this.apiKey });
  }

  /**
   * Determines whether to send the events list to the backend and start a new
   * empty events list, based on the size of the list as well as the last time sent
   * @param nextEventString
   * @returns boolean
   */
  shouldSplitEventsList = (events: Events, nextEventString: string): boolean => {
    const sizeOfNextEvent = new Blob([nextEventString]).size;
    const sizeOfEventsList = new Blob(events).size;
    if (sizeOfEventsList + sizeOfNextEvent >= this.maxPersistedEventsSize) {
      return true;
    }
    if (this.timeAtLastSplit !== null && Date.now() - this.timeAtLastSplit > this.interval && events.length) {
      this.interval = Math.min(MAX_INTERVAL, this.interval + MIN_INTERVAL);
      this.timeAtLastSplit = Date.now();
      return true;
    }
    return false;
  };

  getSequencesToSend = async () => {
    try {
      const sequencesToSend = (await this.db?.getAll<'sequencesToSend'>(
        sequencesToSendKey,
      )) as SendingSequencesIDBReturn[];

      return sequencesToSend;
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  };

  storeCurrentSequence = async (sessionId: number) => {
    try {
      if (!this.db) {
        return undefined;
      }
      const currentSequenceData = await this.db.get<'sessionCurrentSequence'>(currentSequenceKey, sessionId);
      if (!currentSequenceData) {
        return undefined;
      }

      const sequenceId = await this.db.put<'sequencesToSend'>(sequencesToSendKey, {
        sessionId: sessionId,
        events: currentSequenceData.events,
      });

      await this.db.put<'sessionCurrentSequence'>(currentSequenceKey, { sessionId, events: [] });

      return {
        ...currentSequenceData,
        sessionId,
        sequenceId,
      };
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  };

  addEventToCurrentSequence = async (sessionId: number, event: string) => {
    try {
      const tx = this.db?.transaction<'sessionCurrentSequence', 'readwrite'>(currentSequenceKey, 'readwrite');
      if (!tx) {
        return;
      }
      const sequenceEvents = await tx.store.get(sessionId);
      if (!sequenceEvents) {
        await tx.store.put({ sessionId, events: [event] });
        return;
      }
      let eventsToSend;
      if (this.shouldSplitEventsList(sequenceEvents.events, event)) {
        eventsToSend = sequenceEvents.events;
        // set store to empty array
        await tx.store.put({ sessionId, events: [event] });
      } else {
        // add event to array
        const updatedEvents = sequenceEvents.events.concat(event);
        await tx.store.put({ sessionId, events: updatedEvents });
      }

      await tx.done;
      if (!eventsToSend) {
        return undefined;
      }

      const sequenceId = await this.storeSendingEvents(sessionId, eventsToSend);

      if (!sequenceId) {
        return undefined;
      }

      return {
        events: eventsToSend,
        sessionId,
        sequenceId,
      };
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  };

  storeSendingEvents = async (sessionId: number, events: Events) => {
    try {
      const sequenceId = await this.db?.put<'sequencesToSend'>(sequencesToSendKey, {
        sessionId: sessionId,
        events: events,
      });
      return sequenceId;
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  };

  cleanUpSessionEventsStore = async (sequenceId: number) => {
    try {
      await this.db?.delete<'sequencesToSend'>(sequencesToSendKey, sequenceId);
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
  };
}

export const createEventsIDBStore = async ({ loggerProvider, apiKey }: { loggerProvider: ILogger; apiKey: string }) => {
  const eventsIDBStore = new SessionReplayEventsIDBStore({ loggerProvider, apiKey });
  await eventsIDBStore.initialize();
  return eventsIDBStore;
};
