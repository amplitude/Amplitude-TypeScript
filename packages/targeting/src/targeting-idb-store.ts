import { Logger as ILogger } from '@amplitude/analytics-types';
import { DBSchema, IDBPDatabase, IDBPTransaction, openDB } from 'idb';

export const MAX_IDB_STORAGE_LENGTH = 1000 * 60 * 60 * 24 * 2; // 2 days

// This type is constructed to allow for future proofing - in the future we may want
// to track how many of each event is fired, and we may want to track event properties
// Any further fields, like event properties, can be added to this type without causing
// a breaking change
type EventData = { event_type: string };

type EventTypeStore = { [event_type: string]: { [timestamp: number]: EventData } };

export interface TargetingDB extends DBSchema {
  eventTypesForSession: {
    key: string;
    value: {
      sessionId: string;
      eventTypes: EventTypeStore;
      lastUpdated: number;
    };
  };
}

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
    sessionId: string | number;
    eventType: string;
    eventTime: number;
    loggerProvider: ILogger;
    tx: IDBPTransaction<TargetingDB, ['eventTypesForSession'], 'readwrite'>;
  }) => {
    try {
      const sessionIdStr = String(sessionId);
      const sessionData = await tx.store.get(sessionIdStr);
      const eventTypes = sessionData ? sessionData.eventTypes : {};
      const eventTypeStore = eventTypes[eventType] || {};

      const updatedEventTypes: EventTypeStore = {
        ...eventTypes,
        [eventType]: {
          ...eventTypeStore,
          [eventTime]: { event_type: eventType },
        },
      };

      const updatedSessionData = {
        sessionId: sessionIdStr,
        eventTypes: updatedEventTypes,
        lastUpdated: Date.now(),
      };

      await tx.store.put(updatedSessionData);
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
    currentSessionId: string | number;
    loggerProvider: ILogger;
    tx: IDBPTransaction<TargetingDB, ['eventTypesForSession'], 'readwrite'>;
  }) => {
    try {
      const currentSessionIdStr = String(currentSessionId);
      const allSessions = await tx.store.getAll();
      for (let i = 0; i < allSessions.length; i++) {
        const session = allSessions[i];
        const amountOfTimeSinceSession = Date.now() - session.lastUpdated;
        if (session.sessionId !== currentSessionIdStr && amountOfTimeSinceSession > MAX_IDB_STORAGE_LENGTH) {
          await tx.store.delete(session.sessionId);
        }
      }
    } catch (e) {
      loggerProvider.warn(`Failed to clear old session event types for targeting: ${e as string}`);
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
    sessionId: string | number;
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
