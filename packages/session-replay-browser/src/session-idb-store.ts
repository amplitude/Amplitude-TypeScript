import { getGlobalScope } from '@amplitude/analytics-client-common';
import { Logger as ILogger } from '@amplitude/analytics-types';
import * as IDBKeyVal from 'idb-keyval';
import { SessionReplayRemoteConfig } from './config/types';
import { MAX_IDB_STORAGE_LENGTH, STORAGE_PREFIX, defaultSessionStore } from './constants';
import { STORAGE_FAILURE } from './messages';
import {
  SessionReplaySessionIDBStore as AmplitudeSessionReplaySessionIDBStore,
  Events,
  IDBRemoteConfig,
  IDBStore,
  IDBStoreSession,
  RecordingStatus,
} from './typings/session-replay';

export class SessionReplaySessionIDBStore implements AmplitudeSessionReplaySessionIDBStore {
  apiKey: string;
  customStore: IDBKeyVal.UseStore;
  loggerProvider: ILogger;
  storageKey = '';

  constructor({ apiKey, loggerProvider }: { apiKey: string; loggerProvider: ILogger }) {
    this.loggerProvider = loggerProvider;
    this.apiKey = apiKey;
    const customStore = `amp_session_replay_${apiKey.substring(0, 10)}`;
    this.customStore = IDBKeyVal.createStore(customStore, 'amp_session_replay');
    // todo cant be void
    void this.transitionFromKeyValStore();
  }

  transitionFromKeyValStore = async () => {
    function keyValDatabaseExists() {
      let dbExists = true;
      const globalScope = getGlobalScope();
      return new Promise((resolve) => {
        if (globalScope) {
          const request = globalScope.indexedDB.open('keyval-store');
          request.onupgradeneeded = function () {
            if (request.result.version === 1) {
              dbExists = false;
              request.result.close();
              request.transaction?.abort();
              globalScope.indexedDB.deleteDatabase('keyval-store');
              resolve(dbExists);
            }
          };
          request.onsuccess = function () {
            resolve(dbExists);
          };
        }
      });
    }
    const hasKeyValDb = await keyValDatabaseExists();
    console.log('hasKeyValDb', hasKeyValDb);
    const storageKey = `${STORAGE_PREFIX}_${this.apiKey.substring(0, 10)}`;
    const storedReplaySessionContexts = await IDBKeyVal.get<IDBStore>(storageKey);
    if (storedReplaySessionContexts) {
      await Promise.all(
        Object.keys(storedReplaySessionContexts).map(async (sessionId) => {
          const oldSessionStore = storedReplaySessionContexts[sessionId];
          const numericSessionId = parseInt(sessionId, 10);
          await IDBKeyVal.update<IDBStoreSession>(
            numericSessionId,
            (newSessionStore) => {
              console.log('newSessionStore', newSessionStore);
              if (!newSessionStore) {
                return oldSessionStore;
              }
              if (newSessionStore.currentSequenceId < oldSessionStore.currentSequenceId) {
                return oldSessionStore;
              }

              return newSessionStore;
            },
            this.customStore,
          );
        }),
      );
    }

    const globalScope = getGlobalScope();
    globalScope?.indexedDB.deleteDatabase('keyval-store');
  };

  getAllSessionDataFromStore = async () => {
    try {
      const storedReplaySessionContextsArr = await IDBKeyVal.entries<number, IDBStoreSession>(this.customStore);
      const storedReplaySessionContexts: { [sessionId: number]: IDBStoreSession } = {};
      storedReplaySessionContextsArr.forEach(([sessionId, sessionData]) => {
        storedReplaySessionContexts[sessionId] = sessionData;
      });

      return storedReplaySessionContexts;
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  };

  storeEventsForSession = async (events: Events, sequenceId: number, sessionId: number) => {
    try {
      await IDBKeyVal.update<IDBStoreSession>(
        sessionId,
        (session) => {
          if (!session) {
            session = { ...defaultSessionStore };
          }
          session.currentSequenceId = sequenceId;

          const currentSequence = (session.sessionSequences && session.sessionSequences[sequenceId]) || {};

          currentSequence.events = events;
          currentSequence.status = RecordingStatus.RECORDING;

          return {
            ...session,
            sessionSequences: {
              ...session.sessionSequences,
              [sequenceId]: currentSequence,
            },
          };
        },
        this.customStore,
      );
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
  };

  storeRemoteConfig = async (remoteConfig: SessionReplayRemoteConfig, sessionId?: number) => {
    try {
      await IDBKeyVal.update(this.storageKey, (sessionMap: IDBStore = {}): IDBStore => {
        return {
          ...sessionMap,
          remoteConfig: {
            config: remoteConfig,
            lastFetchedSessionId: sessionId,
          },
        };
      });
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
  };

  getRemoteConfig = async (): Promise<IDBRemoteConfig | void> => {
    try {
      const sessionMap: IDBStore = (await IDBKeyVal.get(this.storageKey)) || {};
      return sessionMap.remoteConfig;
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
  };

  cleanUpSessionEventsStore = async (sessionId: number, sequenceId: number) => {
    try {
      await IDBKeyVal.update<IDBStoreSession>(
        sessionId,
        (session) => {
          if (!session) {
            session = { ...defaultSessionStore };
          }
          const sequenceToUpdate = session.sessionSequences && session.sessionSequences[sequenceId];
          if (!sequenceToUpdate) {
            return session;
          }
          sequenceToUpdate.events = [];
          sequenceToUpdate.status = RecordingStatus.SENT;
          // Delete sent sequences for current session
          Object.entries(session.sessionSequences).forEach(([storedSeqId, sequence]) => {
            const numericStoredSeqId = parseInt(storedSeqId, 10);
            if (sequence.status === RecordingStatus.SENT && sequenceId !== numericStoredSeqId) {
              delete session?.sessionSequences[numericStoredSeqId];
            }
          });
          return session;
        },
        this.customStore,
      );
      // TODO can use get all?
      const storedReplaySessionContextsArr = await IDBKeyVal.entries<number, IDBStoreSession>(this.customStore);

      // Delete any sessions that are older than 3 days
      const sessionsToDelete: number[] = [];
      storedReplaySessionContextsArr.forEach(([sessionId]) => {
        if (Date.now() - sessionId >= MAX_IDB_STORAGE_LENGTH) {
          sessionsToDelete.push(sessionId);
        }
      });
      void IDBKeyVal.delMany(sessionsToDelete, this.customStore);
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
  };
}
