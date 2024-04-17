import { Logger as ILogger } from '@amplitude/analytics-types';
import { DBSchema, openDB } from 'idb';
import {
  ConfigNamespace,
  RemoteConfig,
  RemoteConfigAPIResponse,
  RemoteConfigIDBStore,
  SessionReplayRemoteConfig,
} from './types';

export interface RemoteConfigDB extends DBSchema {
  [ConfigNamespace.SESSION_REPLAY]: {
    key: string;
    value: SessionReplayRemoteConfig;
    indexes: { sessionId: number };
  };
  lastFetchedSessionId: {
    key: string;
    value: number;
  };
}

export const createStore = async (dbName: string) => {
  return await openDB<RemoteConfigDB>(dbName, 1, {
    upgrade: (db) => {
      if (!db.objectStoreNames.contains(ConfigNamespace.SESSION_REPLAY)) {
        db.createObjectStore(ConfigNamespace.SESSION_REPLAY);
      }
      if (!db.objectStoreNames.contains('lastFetchedSessionId')) {
        db.createObjectStore('lastFetchedSessionId');
      }
    },
  });
};

export const createRemoteConfigIDBStore = async ({
  loggerProvider,
  apiKey,
}: {
  loggerProvider: ILogger;
  apiKey: string;
}): Promise<RemoteConfigIDBStore> => {
  const dbName = `${apiKey.substring(0, 10)}_amp_config`;
  const db = await createStore(dbName);

  const storeRemoteConfig = async (remoteConfig: RemoteConfigAPIResponse, sessionId?: number) => {
    try {
      if (sessionId) {
        await db.put<'lastFetchedSessionId'>('lastFetchedSessionId', sessionId, 'sessionId');
      }
      let configNamespace: ConfigNamespace;
      for (configNamespace in remoteConfig.configs) {
        await db.put(configNamespace, {
          ...remoteConfig.configs[configNamespace],
        });
      }
    } catch (e) {
      loggerProvider.warn(`Failed to store remote config: ${e as string}`);
    }
  };

  const getLastFetchedSessionId = async (): Promise<number | void> => {
    try {
      const lastFetchedSessionId = await db.get('lastFetchedSessionId', 'sessionId');
      return lastFetchedSessionId;
    } catch (e) {
      loggerProvider.warn(`Failed to fetch lastFetchedSessionId: ${e as string}`);
    }
    return undefined;
  };

  const getRemoteConfig = async (configNamespace: ConfigNamespace, key: string): Promise<RemoteConfig | void> => {
    try {
      const config = await db.get(configNamespace, key);
      return config;
    } catch (e) {
      loggerProvider.warn(`Failed to fetch remote config: ${e as string}`);
    }
    return undefined;
  };

  return {
    storeRemoteConfig,
    getRemoteConfig,
    getLastFetchedSessionId,
  };
};
