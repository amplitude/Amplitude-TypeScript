<<<<<<< HEAD
import { Logger as ILogger } from '@amplitude/analytics-types';
=======
import { Logger as ILogger, SpecialEventType } from '@amplitude/analytics-types';
>>>>>>> 3e83ab49 (feat(session replay): add ability to target on multiple events)
import { DBSchema, IDBPDatabase, IDBPTransaction, openDB } from 'idb';

export const MAX_IDB_STORAGE_LENGTH = 1000 * 60 * 60 * 24 * 2; // 2 days

<<<<<<< HEAD
// This type is constructed to allow for future proofing - in the future we may want
// to track how many of each event is fired, and we may want to track event properties
// Any further fields, like event properties, can be added to this type without causing
// a breaking change
type EventData = { event_type: string };

type EventTypeStore = { [event_type: string]: { [timestamp: number]: EventData } };
=======
>>>>>>> 3e83ab49 (feat(session replay): add ability to target on multiple events)
export interface TargetingDB extends DBSchema {
  eventTypesForSession: {
    key: number;
    value: {
      sessionId: number;
<<<<<<< HEAD
      eventTypes: EventTypeStore;
=======
      eventTypes: Set<string>;
>>>>>>> 3e83ab49 (feat(session replay): add ability to target on multiple events)
    };
  };
}

<<<<<<< HEAD
export class TargetingIDBStore {
  dbs: { [apiKey: string]: IDBPDatabase<TargetingDB> } = {};

  createStore = async (dbName: string) => {
    return await openDB<TargetingDB>(dbName, 1, {
      upgrade: (db: IDBPDatabase<TargetingDB>) => {
        if (!db.objectStoreNames.contains('eventTypesForSession')) {
          db.createObjectStore('eventTypesForSession', {
            keyPath: 'sessionId',
          });
        }
      },
    });
  };

  openOrCreateDB = async (apiKey: string) => {
    if (this.dbs && this.dbs[apiKey]) {
      return this.dbs[apiKey];
    }
    const dbName = `${apiKey.substring(0, 10)}_amp_targeting`;
    const db = await this.createStore(dbName);
    this.dbs[apiKey] = db;

    return db;
  };

  updateEventListForSession = async ({
    sessionId,
    eventType,
    eventTime,
    loggerProvider,
    tx,
  }: {
    sessionId: number;
    eventType: string;
    eventTime: number;
    loggerProvider: ILogger;
    tx: IDBPTransaction<TargetingDB, ['eventTypesForSession'], 'readwrite'>;
  }) => {
    try {
      const eventTypesForSessionStorage = await tx.store.get(sessionId);
      const eventTypesForSession = eventTypesForSessionStorage ? eventTypesForSessionStorage.eventTypes : {};
      const eventTypeStore = eventTypesForSession[eventType] || {};

      const updatedEventTypes: EventTypeStore = {
        ...eventTypesForSession,
        [eventType]: {
          ...eventTypeStore,
          [eventTime]: { event_type: eventType },
        },
      };
      await tx.store.put({ sessionId, eventTypes: updatedEventTypes });
      return updatedEventTypes;
    } catch (e) {
      loggerProvider.warn(`Failed to store events for targeting ${sessionId}: ${e as string}`);
    }
    return undefined;
  };

  deleteOldSessionEventTypes = async ({
    currentSessionId,
    loggerProvider,
    tx,
  }: {
    currentSessionId: number;
    loggerProvider: ILogger;
    tx: IDBPTransaction<TargetingDB, ['eventTypesForSession'], 'readwrite'>;
  }) => {
    try {
      const allEventTypeObjs = await tx.store.getAll();
      for (let i = 0; i < allEventTypeObjs.length; i++) {
        const eventTypeObj = allEventTypeObjs[i];
        const amountOfTimeSinceSession = Date.now() - eventTypeObj.sessionId;
        if (eventTypeObj.sessionId !== currentSessionId && amountOfTimeSinceSession > MAX_IDB_STORAGE_LENGTH) {
          await tx.store.delete(eventTypeObj.sessionId);
        }
      }
    } catch (e) {
      loggerProvider.warn(`Failed to clear old session events for targeting: ${e as string}`);
    }
  };

  storeEventTypeForSession = async ({
    loggerProvider,
    sessionId,
    eventType,
    eventTime,
    apiKey,
  }: {
    loggerProvider: ILogger;
    apiKey: string;
    eventType: string;
    eventTime: number;
    sessionId: number;
  }) => {
    try {
      const db = await this.openOrCreateDB(apiKey);

      const tx = db.transaction<'eventTypesForSession', 'readwrite'>('eventTypesForSession', 'readwrite');
      if (!tx) {
        return;
      }

      // Update the list of events for the session
      const updatedEventTypes = await this.updateEventListForSession({
        sessionId,
        tx,
        loggerProvider,
        eventType,
        eventTime,
      });

      // Clear out sessions older than 2 days
      await this.deleteOldSessionEventTypes({ currentSessionId: sessionId, tx, loggerProvider });

      await tx.done;

      return updatedEventTypes;
    } catch (e) {
      loggerProvider.warn(`Failed to store events for targeting ${sessionId}: ${e as string}`);
    }
    return undefined;
  };
}

export const targetingIDBStore = new TargetingIDBStore();
=======
export const createStore = async (dbName: string) => {
  return await openDB<TargetingDB>(dbName, 1, {
    upgrade: (db: IDBPDatabase<TargetingDB>) => {
      if (!db.objectStoreNames.contains('eventTypesForSession')) {
        db.createObjectStore('eventTypesForSession', {
          keyPath: 'sessionId',
        });
      }
    },
  });
};

const openOrCreateDB = async (apiKey: string) => {
  const dbName = `${apiKey.substring(0, 10)}_amp_targeting`;
  return await createStore(dbName);
};

export const updateEventListForSession = async ({
  sessionId,
  eventType,
  loggerProvider,
  tx,
}: {
  sessionId: number;
  eventType: string;
  loggerProvider: ILogger;
  tx: IDBPTransaction<TargetingDB, ['eventTypesForSession'], 'readwrite'>;
}) => {
  try {
    const eventTypesForSessionStorage = await tx.store.get(sessionId);
    const eventTypesForSession = eventTypesForSessionStorage ? eventTypesForSessionStorage.eventTypes : new Set([]);

    const updatedEventTypes = eventTypesForSession.add(eventType);
    updatedEventTypes && (await tx.store.put({ sessionId, eventTypes: updatedEventTypes }));
    return updatedEventTypes;
  } catch (e) {
    loggerProvider.warn(`Failed to store events for targeting ${sessionId}: ${e as string}`);
  }
  return undefined;
};

export const deleteOldSessionEventTypes = async ({
  currentSessionId,
  loggerProvider,
  tx,
}: {
  currentSessionId: number;
  loggerProvider: ILogger;
  tx: IDBPTransaction<TargetingDB, ['eventTypesForSession'], 'readwrite'>;
}) => {
  try {
    const allEventTypeObjs = await tx.store.getAll();
    for (let i = 0; i < allEventTypeObjs.length; i++) {
      const eventTypeObj = allEventTypeObjs[i];
      const amountOfTimeSinceSession = Date.now() - eventTypeObj.sessionId;
      if (eventTypeObj.sessionId !== currentSessionId && amountOfTimeSinceSession > MAX_IDB_STORAGE_LENGTH) {
        await tx.store.delete(eventTypeObj.sessionId);
      }
    }
  } catch (e) {
    loggerProvider.warn(`Failed to clear old session events for targeting: ${e as string}`);
  }
};

export const storeEventTypeForSession = async ({
  loggerProvider,
  sessionId,
  eventType,
  apiKey,
}: {
  loggerProvider: ILogger;
  apiKey: string;
  eventType: string;
  sessionId: number;
}) => {
  if (
    [SpecialEventType.GROUP_IDENTIFY, SpecialEventType.IDENTIFY, SpecialEventType.REVENUE].includes(
      eventType as SpecialEventType,
    )
  ) {
    return;
  }

  try {
    const db = await openOrCreateDB(apiKey);

    const tx = db.transaction<'eventTypesForSession', 'readwrite'>('eventTypesForSession', 'readwrite');
    if (!tx) {
      return;
    }

    // Update the list of events for the session
    const updatedEventTypes = await updateEventListForSession({ sessionId, tx, loggerProvider, eventType });

    // Clear out sessions older than 2 days
    await deleteOldSessionEventTypes({ currentSessionId: sessionId, tx, loggerProvider });

    await tx.done;

    return updatedEventTypes;
  } catch (e) {
    loggerProvider.warn(`Failed to store events for targeting ${sessionId}: ${e as string}`);
  }
  return undefined;
};
>>>>>>> 3e83ab49 (feat(session replay): add ability to target on multiple events)
