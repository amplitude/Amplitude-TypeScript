import { STORAGE_PREFIX, getGlobalScope } from '@amplitude/analytics-core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { STORAGE_FAILURE } from '../messages';
import { EventType, Events, SendingSequencesReturn } from '../typings/session-replay';
import { BaseEventsStore, InstanceArgs as BaseInstanceArgs } from './base-events-store';
import { IDBStore, IDBStoreSession, RecordingStatus } from './legacy-idb-types';

export const currentSequenceKey = 'sessionCurrentSequence';
export const sequencesToSendKey = 'sequencesToSend';
export const remoteConfigKey = 'remoteConfig';

export interface SessionReplayDB extends DBSchema {
  sessionCurrentSequence: {
    key: number;
    value: Omit<SendingSequencesReturn<number>, 'sequenceId'>;
  };
  sequencesToSend: {
    key: number;
    value: Omit<SendingSequencesReturn<number>, 'sequenceId'>;
    indexes: { sessionId: string | number };
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
      request.onerror = function () {
        reject(request.error);
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

type InstanceArgs = {
  apiKey: string;
  db: IDBPDatabase<SessionReplayDB>;
} & BaseInstanceArgs;

export class SessionReplayEventsIDBStore extends BaseEventsStore<number> {
  private readonly apiKey: string;
  private readonly db: IDBPDatabase<SessionReplayDB>;

  constructor(args: InstanceArgs) {
    super(args);
    this.apiKey = args.apiKey;
    this.db = args.db;
  }

  static async new(
    type: EventType,
    args: Omit<InstanceArgs, 'db'>,
    sessionId?: string | number,
  ): Promise<SessionReplayEventsIDBStore | undefined> {
    try {
      const dbSuffix = type === 'replay' ? '' : `_${type}`;
      const dbName = `${args.apiKey.substring(0, 10)}_amp_session_replay_events${dbSuffix}`;
      const db = await createStore(dbName);
      const eventsIDBStore = new SessionReplayEventsIDBStore({
        ...args,
        db,
      });
      await eventsIDBStore.transitionFromKeyValStore(sessionId);
      return eventsIDBStore;
    } catch (e) {
      args.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return;
  }

  async getCurrentSequenceEvents(sessionId?: number) {
    if (sessionId) {
      const events = await this.db.get('sessionCurrentSequence', sessionId);
      if (!events) {
        return undefined;
      }
      return [events];
    }

    const allEvents = [];
    for (const events of await this.db.getAll('sessionCurrentSequence')) {
      allEvents.push(events);
    }

    return allEvents;
  }

  getSequencesToSend = async (): Promise<SendingSequencesReturn<number>[] | undefined> => {
    try {
      const sequences: SendingSequencesReturn<number>[] = [];
      let cursor = await this.db.transaction('sequencesToSend').store.openCursor();
      while (cursor) {
        const { sessionId, events } = cursor.value;
        sequences.push({
          events,
          sequenceId: cursor.key,
          sessionId,
        });
        cursor = await cursor.continue();
      }

      return sequences;
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  };

  storeCurrentSequence = async (sessionId: number) => {
    try {
      const currentSequenceData = await this.db.get<'sessionCurrentSequence'>(currentSequenceKey, sessionId);
      if (!currentSequenceData) {
        return undefined;
      }

      const sequenceId = await this.db.put<'sequencesToSend'>(sequencesToSendKey, {
        sessionId: sessionId,
        events: currentSequenceData.events,
      });

      await this.db.put<'sessionCurrentSequence'>(currentSequenceKey, {
        sessionId,
        events: [],
      });

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
      const tx = this.db.transaction<'sessionCurrentSequence', 'readwrite'>(currentSequenceKey, 'readwrite');
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
      const sequenceId = await this.db.put<'sequencesToSend'>(sequencesToSendKey, {
        sessionId: sessionId,
        events: events,
      });
      return sequenceId;
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  };

  cleanUpSessionEventsStore = async (_sessionId: number, sequenceId?: number) => {
    if (!sequenceId) {
      return;
    }
    try {
      await this.db.delete<'sequencesToSend'>(sequencesToSendKey, sequenceId);
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
  };

  transitionFromKeyValStore = async (sessionId?: string | number) => {
    try {
      const keyValDb = await keyValDatabaseExists();
      if (!keyValDb) {
        return;
      }

      const transitionCurrentSessionSequences = async (numericSessionId: number, sessionStore: IDBStoreSession) => {
        const currentSessionSequences = sessionStore.sessionSequences;
        const promisesToBatch: Promise<number | SendingSequencesReturn<number> | undefined>[] = [];

        Object.keys(currentSessionSequences).forEach((sequenceId) => {
          const numericSequenceId = parseInt(sequenceId, 10);
          const sequence = currentSessionSequences[numericSequenceId];
          if (numericSequenceId === sessionStore.currentSequenceId) {
            const eventAddPromises: Promise<SendingSequencesReturn<number> | undefined>[] = sequence.events.map(
              async (event) => this.addEventToCurrentSequence(numericSessionId, event),
            );
            promisesToBatch.push(...eventAddPromises);
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
