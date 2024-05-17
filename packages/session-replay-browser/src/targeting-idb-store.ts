import { Logger as ILogger } from '@amplitude/analytics-types';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { STORAGE_FAILURE } from './messages';

export interface SessionReplayTargetingDB extends DBSchema {
  sessionTargetingMatch: {
    key: number;
    value: {
      sessionId: number;
      targetingMatch: boolean;
    };
  };
}

export const createStore = async (dbName: string) => {
  return await openDB<SessionReplayTargetingDB>(dbName, 1, {
    upgrade: (db: IDBPDatabase<SessionReplayTargetingDB>) => {
      if (!db.objectStoreNames.contains('sessionTargetingMatch')) {
        db.createObjectStore('sessionTargetingMatch', {
          keyPath: 'sessionId',
        });
      }
    },
  });
};

const openOrCreateDB = async (apiKey: string) => {
  const dbName = `${apiKey.substring(0, 10)}_amp_session_replay_targeting`;
  return await createStore(dbName);
};

export const getTargetingMatchForSession = async ({
  loggerProvider,
  apiKey,
  sessionId,
}: {
  loggerProvider: ILogger;
  apiKey: string;
  sessionId: number;
}) => {
  const db = await openOrCreateDB(apiKey);
  try {
    const targetingMatchForSession = await db?.get<'sessionTargetingMatch'>('sessionTargetingMatch', sessionId);

    return targetingMatchForSession?.targetingMatch;
  } catch (e) {
    loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
  }
  return undefined;
};

export const storeTargetingMatchForSession = async ({
  loggerProvider,
  apiKey,
  sessionId,
  targetingMatch,
}: {
  loggerProvider: ILogger;
  apiKey: string;
  sessionId: number;
  targetingMatch: boolean;
}) => {
  const db = await openOrCreateDB(apiKey);
  try {
    const targetingMatchForSession = await db?.put<'sessionTargetingMatch'>('sessionTargetingMatch', {
      targetingMatch,
      sessionId,
    });

    return targetingMatchForSession;
  } catch (e) {
    loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
  }
  return undefined;
};
