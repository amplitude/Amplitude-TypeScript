import { getGlobalScope } from '@amplitude/analytics-client-common';
import { STORAGE_PREFIX } from '@amplitude/analytics-core';
import { Logger as ILogger } from '@amplitude/analytics-types';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { MAX_EVENT_LIST_SIZE_IN_BYTES, MAX_INTERVAL, MIN_INTERVAL } from '../constants';
import { STORAGE_FAILURE } from '../messages';
import {
  SessionReplayEventsIDBStore as AmplitudeSessionReplayEventsIDBStore,
  EventType,
  Events,
  SendingSequencesIDBInput,
  SendingSequencesIDBReturn,
} from '../typings/session-replay';
import { IDBStore, IDBStoreSession, RecordingStatus } from './legacy-idb-types';

export const currentSequenceKey = 'sessionCurrentSequence';
export const sequencesToSendKey = 'sequencesToSend';
export const remoteConfigKey = 'remoteConfig';

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

export const keyValDatabaseExists = function (): Promise<IDBDatabase | void> {
  const globalScope = getGlobalScope();
  return new Promise((resolve, reject) => {
    if (!globalScope) {
      return reject(new Error('Global scope not found'));
    }

    if (!globalScope.indexedDB) {
      return reject(new Error('Session Replay: cannot find indexedDB'));
    }

    try {
      const request = globalScope.indexedDB.open('keyval-store');
      request.onupgradeneeded = function () {
        if (request.result.version === 1) {
          request.result.close();
          request.transaction && request.transaction.abort();
          globalScope.indexedDB.deleteDatabase('keyval-store');
          resolve();
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
    } catch (e) {
      reject(e);
    }
  });
};

const batchPromiseAll = async (promiseBatch: Promise<any>[]) => {
  while (promiseBatch.length > 0) {
    const chunkSize = 10;
    const batch = promiseBatch.splice(0, chunkSize);
    await Promise.all(batch);
  }
};

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

  async initialize(type: EventType, sessionId?: number) {
    const dbName = `${this.apiKey.substring(0, 10)}_amp_session_replay_events_${type}`;
    this.db = await createStore(dbName);
    this.timeAtLastSplit = Date.now(); // Initialize this so we have a point of comparison when events are recorded
    await this.transitionFromKeyValStore(sessionId);
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

  transitionFromKeyValStore = async (sessionId?: number) => {
    try {
      const keyValDb = await keyValDatabaseExists();
      if (!keyValDb) {
        return;
      }

      const transitionCurrentSessionSequences = async (numericSessionId: number, sessionStore: IDBStoreSession) => {
        const currentSessionSequences = sessionStore.sessionSequences;
        const promisesToBatch: Promise<number | SendingSequencesIDBReturn | undefined>[] = [];

        Object.keys(currentSessionSequences).forEach((sequenceId) => {
          const numericSequenceId = parseInt(sequenceId, 10);
          const sequence = currentSessionSequences[numericSequenceId];
          if (numericSequenceId === sessionStore.currentSequenceId) {
            const eventAddPromises: Promise<SendingSequencesIDBReturn | undefined>[] = sequence.events.map(
              async (event) => this.addEventToCurrentSequence(numericSessionId, event),
            );
            promisesToBatch.concat(eventAddPromises);
          } else if (sequence.status !== RecordingStatus.SENT) {
            promisesToBatch.push(this.storeSendingEvents(numericSessionId, sequence.events));
          }
        });

        await batchPromiseAll(promisesToBatch);
      };

      const storageKey = `${STORAGE_PREFIX}_${this.apiKey.substring(0, 10)}`;
      try {
        const getAllRequest = keyValDb.transaction('keyval').objectStore('keyval').getAll(storageKey);
        const transitionPromise = new Promise<void>((resolve) => {
          getAllRequest.onsuccess = async (e) => {
            const storedReplaySessionContextList = e && ((e.target as IDBRequest).result as IDBStore[]);
            const storedReplaySessionContexts = storedReplaySessionContextList && storedReplaySessionContextList[0];
            if (storedReplaySessionContexts) {
              const promisesToBatch: Promise<any>[] = [];

              Object.keys(storedReplaySessionContexts).forEach((storedSessionId) => {
                const numericSessionId = parseInt(storedSessionId, 10);
                const oldSessionStore = storedReplaySessionContexts[numericSessionId];

                if (sessionId === numericSessionId) {
                  promisesToBatch.push(transitionCurrentSessionSequences(numericSessionId, oldSessionStore));
                } else {
                  const oldSessionSequences = oldSessionStore.sessionSequences;
                  Object.keys(oldSessionSequences).forEach((sequenceId) => {
                    const numericSequenceId = parseInt(sequenceId, 10);
                    if (oldSessionSequences[numericSequenceId].status !== RecordingStatus.SENT) {
                      promisesToBatch.push(
                        this.storeSendingEvents(numericSessionId, oldSessionSequences[numericSequenceId].events),
                      );
                    }
                  });
                }
              });

              await batchPromiseAll(promisesToBatch);
            }
            resolve();
          };
        });

        await transitionPromise;
        const globalScope = getGlobalScope();
        if (globalScope) {
          globalScope.indexedDB.deleteDatabase('keyval-store');
        }
      } catch (e) {
        this.loggerProvider.warn(`Failed to transition session replay events from keyval to new store: ${e as string}`);
      }
    } catch (e) {
      this.loggerProvider.warn(
        `Failed to access keyval store: ${
          e as string
        }. For more information, visit: https://www.docs.developers.amplitude.com/session-replay/sdks/standalone/#indexeddb-best-practices`,
      );
    }
  };
}

export const createEventsIDBStore = async ({
  loggerProvider,
  apiKey,
  sessionId,
  type,
}: {
  loggerProvider: ILogger;
  apiKey: string;
  type: EventType;
  sessionId?: number;
}) => {
  const eventsIDBStore = new SessionReplayEventsIDBStore({ loggerProvider, apiKey });
  await eventsIDBStore.initialize(type, sessionId);
  return eventsIDBStore;
};
