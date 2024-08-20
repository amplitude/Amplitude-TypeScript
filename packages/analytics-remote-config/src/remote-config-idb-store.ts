/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Logger as ILogger } from '@amplitude/analytics-types';
import { DBSchema, deleteDB, IDBPTransaction, openDB } from 'idb';
import { RemoteConfigAPIResponse, RemoteConfigIDBStore } from './types';

const MAX_IDB_STORAGE_TIME = 1000 * 60 * 60 * 24 * 3; // 3 days
export interface MetaDB extends DBSchema {
  lastFetchedSessionId: {
    key: string;
    value: number;
  };
}

export interface RemoteConfigDB extends DBSchema {
  remoteConfig: {
    key: string; // configKey
    value: { [key: string]: any }; // configObject
  };
}

// interface RemoteConfigDBV1 extends DBSchema {
//   [configKey: string]: {
//     key: string;
//     value: { [key: string]: any }; // configObject
//   };
// }

export const openOrCreateRemoteConfigStoreV1 = async (dbName: string, configKeys: string[]) => {
  console.log('opening v1');
  return await openDB(dbName, 1, {
    upgrade: (db) => {
      console.log('inside v1 upgrade');
      configKeys.forEach((key: string) => {
        if (!db.objectStoreNames.contains(key)) {
          db.createObjectStore(key);
        }
      });
    },
    blocked: () => {
      // log
      console.log('blocked v1');
    },
    blocking(currentVersion, blockedVersion, event) {
      // log
      console.log('blocking v1', 'currentVersion', currentVersion, 'blockedVersion', blockedVersion);
      (event.target as IDBDatabase).close();
    },
  });
};

export const openOrCreateRemoteConfigStore = async (dbName: string, configKeys: string[]) => {
  console.log('opening DB');
  return await openDB<RemoteConfigDB>(dbName, 2, {
    upgrade: (db, oldVersion, _newVersion, transaction) => {
      console.log('inside upgrade');
      if (!db.objectStoreNames.contains('remoteConfig')) {
        db.createObjectStore('remoteConfig');
      }

      if (oldVersion === 1) {
        // const v1Db = db as unknown as IDBPDatabase<RemoteConfigDBV1>;
        const v1Transaction = transaction as unknown as IDBPTransaction;
        const newRemoteConfigStore = transaction.objectStore('remoteConfig');
        configKeys.forEach((key: string) => {
          const previousStore = v1Transaction.objectStore(key);
          previousStore
            .getAll()
            .then((previousStoreValue) => {
              console.log('previousStore', previousStoreValue, 'key', key);
              newRemoteConfigStore.put(previousStoreValue, key).catch((_e) => {
                // todo
                console.log('error', _e);
              });
            })
            .catch((_e) => {
              // todo
              console.log('error', _e);
            });
        });
      }
    },
    blocked: () => {
      // log
      console.log('blocked');
    },
    blocking(currentVersion, blockedVersion, event) {
      // log
      console.log('blocking', 'currentVersion', currentVersion, 'blockedVersion', blockedVersion);
      (event.target as IDBDatabase).close();
    },
  });
};

export const openOrCreateMetaStore = async (dbName: string) => {
  return await openDB<MetaDB>(dbName, 1, {
    upgrade: (db) => {
      if (!db.objectStoreNames.contains('lastFetchedSessionId')) {
        db.createObjectStore('lastFetchedSessionId');
      }
    },
  });
};

export const createRemoteConfigIDBStore = async <RemoteConfig extends { [key: string]: object }>({
  loggerProvider,
  apiKey,
  configKeys,
}: {
  loggerProvider: ILogger;
  apiKey: string;
  configKeys: string[];
}): Promise<RemoteConfigIDBStore<RemoteConfig>> => {
  console.log('inside createRemoteConfigIDBStore');
  const remoteConfigDBName = `${apiKey.substring(0, 10)}_amp_config`;
  const remoteConfigDBV1 = await openOrCreateRemoteConfigStoreV1(remoteConfigDBName, configKeys);
  console.log('after create v1');
  remoteConfigDBV1.close();
  console.log('after close v1');

  let remoteConfigDB = await openOrCreateRemoteConfigStore(remoteConfigDBName, configKeys);
  console.log('after v2 created');
  const metaDBName = `${apiKey.substring(0, 10)}_amp_config_meta`;
  const metaDB = await openOrCreateMetaStore(metaDBName);

  try {
    const lastFetchedSessionId = await metaDB.get('lastFetchedSessionId', 'sessionId');
    if (lastFetchedSessionId && Date.now() - lastFetchedSessionId >= MAX_IDB_STORAGE_TIME) {
      remoteConfigDB.close();
      await deleteDB(remoteConfigDBName);
      remoteConfigDB = await openOrCreateRemoteConfigStore(remoteConfigDBName, configKeys);
    }
  } catch (e) {
    loggerProvider.warn(`Failed to reset store: ${e as string}`);
  }

  const storeRemoteConfig = async (remoteConfig: RemoteConfigAPIResponse<RemoteConfig>, sessionId?: number) => {
    try {
      if (sessionId) {
        await metaDB.put<'lastFetchedSessionId'>('lastFetchedSessionId', sessionId, 'sessionId');
      }
      const tx = remoteConfigDB.transaction('remoteConfig', 'readwrite');
      for (const configNamespace in remoteConfig.configs) {
        const config = remoteConfig.configs[configNamespace];
        await Promise.all([...Object.keys(config).map((key) => tx.store.put({ ...config[key] }, key)), tx.done]);
      }
    } catch (e) {
      loggerProvider.warn(`Failed to store remote config: ${e as string}`);
    }
  };

  const getLastFetchedSessionId = async (): Promise<number | void> => {
    try {
      const lastFetchedSessionId = await metaDB.get('lastFetchedSessionId', 'sessionId');
      return lastFetchedSessionId;
    } catch (e) {
      loggerProvider.warn(`Failed to fetch lastFetchedSessionId: ${e as string}`);
    }
    return undefined;
  };

  const getRemoteConfig = async <K extends keyof RemoteConfig>(
    configNamespace: string,
    key: K,
  ): Promise<RemoteConfig[K] | undefined> => {
    try {
      const config = await remoteConfigDB.get('remoteConfig', configNamespace);
      console.log('config', config);
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return config ? config[key] : undefined;
    } catch (e) {
      console.log('failed', e);
      loggerProvider.warn(`Failed to fetch remote config: ${e as string}`);
    }
    return undefined;
  };
  //<K extends keyof RemoteConfig>
  const remoteConfigHasValues = async (configNamespace: string): Promise<boolean> => {
    try {
      // const config = (await remoteConfigDB.getAll(configNamespace)) as RemoteConfig[K][];
      const config = await remoteConfigDB.get('remoteConfig', configNamespace);
      return !!config && !!Object.values(config).length;
    } catch (e) {
      loggerProvider.warn(`Failed to fetch remote config: ${e as string}`);
    }
    return false;
  };

  return {
    storeRemoteConfig,
    getRemoteConfig,
    getLastFetchedSessionId,
    remoteConfigHasValues,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    db: remoteConfigDB,
  };
};
