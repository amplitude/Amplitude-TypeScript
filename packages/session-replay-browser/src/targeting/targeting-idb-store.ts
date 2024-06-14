import { Logger as ILogger } from '@amplitude/analytics-types';
import { DBSchema, IDBPDatabase, openDB } from 'idb';

export const MAX_IDB_STORAGE_LENGTH = 1000 * 60 * 60 * 24 * 2; // 2 days
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
  try {
    const db = await openOrCreateDB(apiKey);
    const targetingMatchForSession = await db.get<'sessionTargetingMatch'>('sessionTargetingMatch', sessionId);

    return targetingMatchForSession?.targetingMatch;
  } catch (e) {
    loggerProvider.warn(`Failed to get targeting match for session id ${sessionId}: ${e as string}`);
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
  try {
    const db = await openOrCreateDB(apiKey);
    const targetingMatchForSession = await db.put<'sessionTargetingMatch'>('sessionTargetingMatch', {
      targetingMatch,
      sessionId,
    });

    return targetingMatchForSession;
  } catch (e) {
    loggerProvider.warn(`Failed to store targeting match for session id ${sessionId}: ${e as string}`);
  }
  return undefined;
};

export const clearStoreOfOldSessions = async ({
  loggerProvider,
  apiKey,
  currentSessionId,
}: {
  loggerProvider: ILogger;
  apiKey: string;
  currentSessionId: number;
}) => {
  try {
    const db = await openOrCreateDB(apiKey);
    const tx = db.transaction<'sessionTargetingMatch', 'readwrite'>('sessionTargetingMatch', 'readwrite');
    const allTargetingMatchObjs = await tx.store.getAll();
    for (let i = 0; i < allTargetingMatchObjs.length; i++) {
      const targetingMatchObj = allTargetingMatchObjs[i];
      const amountOfTimeSinceSession = Date.now() - targetingMatchObj.sessionId;
      if (targetingMatchObj.sessionId !== currentSessionId && amountOfTimeSinceSession > MAX_IDB_STORAGE_LENGTH) {
        await tx.store.delete(targetingMatchObj.sessionId);
      }
    }
    await tx.done;
  } catch (e) {
    loggerProvider.warn(`Failed to clear old targeting matches for sessions: ${e as string}`);
  }
};
