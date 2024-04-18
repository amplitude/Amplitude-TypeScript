import { Logger as ILogger } from '@amplitude/analytics-types';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { MAX_EVENT_LIST_SIZE_IN_BYTES, MAX_IDB_STORAGE_LENGTH, MAX_INTERVAL, MIN_INTERVAL } from './constants';
import { currentSequenceKey, sendingSequencesKey } from './idb-helpers';
import { STORAGE_FAILURE } from './messages';
import {
  SessionReplayEventsIDBStore as AmplitudeSessionReplayEventsIDBStore,
  Events,
  SendingSequencesData,
  SendingStatus,
} from './typings/session-replay';

export interface SessionReplayDB extends DBSchema {
  sessionCurrentSequence: {
    key: number;
    value: {
      sessionId: number;
      events: Events;
    };
  };
  sendingSequences: {
    key: number;
    value: SendingSequencesData;
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
  if (!db.objectStoreNames.contains(sendingSequencesKey)) {
    sequencesStore = db.createObjectStore(sendingSequencesKey, {
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
  private shouldSplitEventsList = (events: Events, nextEventString: string): boolean => {
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

  getUnsentSequences = async () => {
    try {
      const tx = this.db?.transaction<'sendingSequences', 'readonly'>(sendingSequencesKey, 'readonly');
      if (!tx) {
        return;
      }

      let cursor = await tx.store.openCursor();
      const unsentSequences = [];

      while (cursor) {
        if (cursor.value.events.length && cursor.value.status === SendingStatus.SENDING) {
          unsentSequences.push(cursor.value);
        }

        // Advance the cursor to the next row:
        cursor = await cursor.continue();
      }

      await tx.done;
      return unsentSequences;
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  };

  getCurrentSequenceForSession = async (sessionId: number) => {
    try {
      const currentSequenceData = await this.db?.get<'sessionCurrentSequence'>(currentSequenceKey, sessionId);
      return currentSequenceData?.events;
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  };

  addEventToSequence = async (sessionId: number, event: string) => {
    try {
      const tx = this.db?.transaction<'sessionCurrentSequence', 'readwrite'>(currentSequenceKey, 'readwrite');
      if (!tx) {
        return;
      }
      const sequenceEvents = await tx.store.get(sessionId);
      if (!sequenceEvents) {
        await tx.store.put({ sessionId, events: [] });
        return;
      }
      let eventsToSend;
      if (this.shouldSplitEventsList(sequenceEvents.events, event)) {
        eventsToSend = sequenceEvents.events;
        // set store to empty array
        await tx.store.put({ sessionId, events: [] });
      } else {
        // add event to array
        const updatedEvents = sequenceEvents.events.concat(event);
        await tx.store.put({ sessionId, events: updatedEvents });
      }

      await tx.done;
      return eventsToSend;
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  };

  storeSendingEvents = async (sessionId: number, events: Events) => {
    try {
      const sequenceId = await this.db?.put<'sendingSequences'>(sendingSequencesKey, {
        sessionId: sessionId,
        events: events,
        status: SendingStatus.SENDING,
      });
      return sequenceId;
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  };

  private deleteSentAndOldFromSession = async (sessionId: number) => {
    const tx = this.db?.transaction<'sendingSequences', 'readwrite'>(sendingSequencesKey, 'readwrite');
    if (!tx) {
      return;
    }

    let cursor = await tx.store.openCursor();
    const currentTime = Date.now();

    while (cursor) {
      // Delete sent sequences for current session
      if (cursor.value.sessionId === sessionId && cursor.value.status === SendingStatus.SENT) {
        await cursor.delete();
      }

      // Delete any sessions that are older than 3 days
      if (currentTime - cursor.value.sessionId >= MAX_IDB_STORAGE_LENGTH) {
        await cursor.delete();
      }

      // Advance the cursor to the next row:
      cursor = await cursor.continue();
    }

    await tx.done;
  };

  cleanUpSessionEventsStore = async (sessionId: number, sequenceId: number) => {
    try {
      await this.deleteSentAndOldFromSession(sessionId);

      await this.db?.put<'sendingSequences'>(sendingSequencesKey, {
        sequenceId: sequenceId,
        sessionId: sessionId,
        events: [],
        status: SendingStatus.SENT,
      });
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
