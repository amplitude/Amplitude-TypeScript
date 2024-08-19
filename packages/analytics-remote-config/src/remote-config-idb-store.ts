import { Logger as ILogger } from '@amplitude/analytics-types';
import { DBSchema, deleteDB, openDB } from 'idb';
import { RemoteConfigAPIResponse, RemoteConfigIDBStore } from './types';

const MAX_IDB_STORAGE_TIME = 1000 * 60 * 60 * 24 * 3; // 3 days
export interface MetaDB extends DBSchema {
  lastFetchedSessionId: {
    key: string;
    value: number;
  };
  lastRemoteConfigVersion: {
    key: string;
    value: number;
  };
}

export const openOrCreateRemoteConfigStore = async (dbName: string, configKeys: string[], version: number) => {
  console.log('open called', version);
  return await openDB(dbName, version, {
    upgrade: (db) => {
      console.log('openDB');
      configKeys.forEach((key: string) => {
        if (!db.objectStoreNames.contains(key)) {
          db.createObjectStore(key);
        }
      });
    },
    blocked: (currentVersion: number, blockedVersion: number) => {
      console.log('blocked, currentVersion', currentVersion, 'blockedVersion', blockedVersion);
    },
    blocking(_currentVersion, _blockedVersion, event) {
      (event.target as IDBDatabase)?.close();
    },
  });
};

export const openOrCreateMetaStore = async (dbName: string) => {
  return await openDB<MetaDB>(dbName, 2, {
    upgrade: (db) => {
      if (!db.objectStoreNames.contains('lastFetchedSessionId')) {
        db.createObjectStore('lastFetchedSessionId');
      }
      if (!db.objectStoreNames.contains('lastRemoteConfigVersion')) {
        db.createObjectStore('lastRemoteConfigVersion');
      }
    },
    blocking(currentVersion, blockedVersion, event) {
      console.log('blocking, currentVersion', currentVersion, 'blockedVersion', blockedVersion);
      (event.target as IDBDatabase)?.close();
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
  const metaDBName = `${apiKey.substring(0, 10)}_amp_config_meta`;
  const metaDB = await openOrCreateMetaStore(metaDBName);
  const remoteConfigVersion = (await metaDB.get('lastRemoteConfigVersion', 'version')) || 1;
  const remoteConfigDBName = `${apiKey.substring(0, 10)}_amp_config`;
  let remoteConfigDB = await openOrCreateRemoteConfigStore(remoteConfigDBName, configKeys, remoteConfigVersion + 1);

  try {
    const lastFetchedSessionId = await metaDB.get('lastFetchedSessionId', 'sessionId');
    if (lastFetchedSessionId && Date.now() - lastFetchedSessionId >= MAX_IDB_STORAGE_TIME) {
      remoteConfigDB.close();
      await deleteDB(remoteConfigDBName);
      remoteConfigDB = await openOrCreateRemoteConfigStore(remoteConfigDBName, configKeys, remoteConfigVersion);
    }
  } catch (e) {
    loggerProvider.warn(`Failed to reset store: ${e as string}`);
  }

  await metaDB.put('lastRemoteConfigVersion', remoteConfigDB.version, 'version');

  const storeRemoteConfig = async (remoteConfig: RemoteConfigAPIResponse<RemoteConfig>, sessionId?: number) => {
    try {
      if (sessionId) {
        await metaDB.put<'lastFetchedSessionId'>('lastFetchedSessionId', sessionId, 'sessionId');
      }
      for (const configNamespace in remoteConfig.configs) {
        const config = remoteConfig.configs[configNamespace];
        const tx = remoteConfigDB.transaction(configNamespace, 'readwrite');
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
      const config = (await remoteConfigDB.get(configNamespace, key as string)) as RemoteConfig[K];
      return config;
    } catch (e) {
      loggerProvider.warn(`Failed to fetch remote config: ${e as string}`);
    }
    return undefined;
  };

  const remoteConfigHasValues = async <K extends keyof RemoteConfig>(configNamespace: string): Promise<boolean> => {
    try {
      const config = (await remoteConfigDB.getAll(configNamespace)) as RemoteConfig[K][];
      return !!config.length;
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
  };
};
