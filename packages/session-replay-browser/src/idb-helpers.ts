import { getGlobalScope } from '@amplitude/analytics-client-common';
import { STORAGE_PREFIX } from '@amplitude/analytics-core';
import * as IDBKeyVal from 'idb-keyval';
import { IDBStore, IDBStoreSession } from './typings/session-replay';

export const currentSequenceKey = 'sessionCurrentSequence';
export const sendingSequencesKey = 'sendingSequences';
export const remoteConfigKey = 'remoteConfig';

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

export const transitionFromKeyValStore = async ({ apiKey }: { apiKey: string }) => {
  const hasKeyValDb = await keyValDatabaseExists();
  if (!hasKeyValDb) {
    return;
  }
  console.log('hasKeyValDb', hasKeyValDb);
  const storageKey = `${STORAGE_PREFIX}_${apiKey.substring(0, 10)}`;
  const storedReplaySessionContexts = await IDBKeyVal.get<IDBStore>(storageKey);
  if (storedReplaySessionContexts) {
    await Promise.all(
      Object.keys(storedReplaySessionContexts).map(async (sessionId) => {
        const numericSessionId = parseInt(sessionId, 10);
        const oldSessionStore: IDBStoreSession = storedReplaySessionContexts[numericSessionId];
        await IDBKeyVal.update<IDBStoreSession>(numericSessionId, (newSessionStore) => {
          console.log('newSessionStore', newSessionStore);
          if (!newSessionStore) {
            return oldSessionStore;
          }
          if (newSessionStore.currentSequenceId < oldSessionStore.currentSequenceId) {
            return oldSessionStore;
          }

          return newSessionStore;
        });
      }),
    );
  }

  const globalScope = getGlobalScope();
  globalScope?.indexedDB.deleteDatabase('keyval-store');
};
