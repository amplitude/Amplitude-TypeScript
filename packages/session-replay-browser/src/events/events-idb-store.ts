import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { STORAGE_FAILURE } from '../messages';
import { EventType, Events, SendingSequencesReturn } from '../typings/session-replay';
import { BaseEventsStore, InstanceArgs as BaseInstanceArgs } from './base-events-store';
import { logIdbError } from '../utils/is-abort-error';

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
  private readonly db: IDBPDatabase<SessionReplayDB>;

  constructor(args: InstanceArgs) {
    super(args);
    this.db = args.db;
  }

  static async new(type: EventType, args: Omit<InstanceArgs, 'db'>): Promise<SessionReplayEventsIDBStore | undefined> {
    try {
      const dbSuffix = type === 'replay' ? '' : `_${type}`;
      const dbName = `${args.apiKey.substring(0, 10)}_amp_session_replay_events${dbSuffix}`;
      const db = await createStore(dbName);
      return new SessionReplayEventsIDBStore({
        ...args,
        db,
      });
    } catch (e) {
      logIdbError(args.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
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
      logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
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
      logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
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
      logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
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
      logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
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
      logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
    }
  };
}
