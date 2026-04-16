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
  onPersistentFailure?: () => void;
  consecutiveFailureThreshold?: number;
} & BaseInstanceArgs;

export class SessionReplayEventsIDBStore extends BaseEventsStore<number> {
  private readonly db: IDBPDatabase<SessionReplayDB>;
  private readonly onPersistentFailure?: () => void;
  private readonly consecutiveFailureThreshold: number;
  private consecutiveFailures = 0;
  private hasTriggeredFallback = false;

  constructor(args: InstanceArgs) {
    super(args);
    this.db = args.db;
    this.onPersistentFailure = args.onPersistentFailure;
    this.consecutiveFailureThreshold = args.consecutiveFailureThreshold ?? 3;
  }

  private recordFailure() {
    this.consecutiveFailures++;
    if (!this.hasTriggeredFallback && this.consecutiveFailures >= this.consecutiveFailureThreshold) {
      this.hasTriggeredFallback = true;
      this.onPersistentFailure?.();
    }
  }

  private recordSuccess() {
    this.consecutiveFailures = 0;
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
    let errorLogged = false;
    try {
      const sequences: SendingSequencesReturn<number>[] = [];
      const tx = this.db.transaction('sequencesToSend');
      // Attach a catch handler immediately so tx.done rejections (e.g. AbortError after
      // cursor traversal completes) are always handled without blocking the return path.
      // The errorLogged flag prevents double-logging when the outer catch already fired
      // for the same abort (e.g. cursor.continue() threw mid-traversal).
      tx.done.catch((e: unknown) => {
        if (!errorLogged) {
          logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
        }
      });
      let cursor = await tx.store.openCursor();
      while (cursor) {
        const { sessionId, events } = cursor.value;
        sequences.push({
          events,
          sequenceId: cursor.key,
          sessionId,
        });
        cursor = await cursor.continue();
      }

      this.recordSuccess();
      return sequences;
    } catch (e) {
      errorLogged = true;
      logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
      this.recordFailure();
    }
    return undefined;
  };

  storeCurrentSequence = async (sessionId: number) => {
    try {
      const currentSequenceData = await this.db.get<'sessionCurrentSequence'>(currentSequenceKey, sessionId);
      if (!currentSequenceData) {
        this.recordSuccess();
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

      this.recordSuccess();
      return {
        ...currentSequenceData,
        sessionId,
        sequenceId,
      };
    } catch (e) {
      logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
      this.recordFailure();
    }
    return undefined;
  };

  addEventToCurrentSequence = async (sessionId: number, event: string) => {
    let errorLogged = false;
    try {
      // Always open a readwrite transaction over both stores so that the read and
      // any subsequent write are atomic.  IDB serializes readwrite transactions on
      // overlapping stores, so concurrent fire-and-forget callers (events-manager
      // does not await this method) are queued by the engine rather than interleaving
      // — eliminating the TOCTOU race that a narrow-read + separate-write approach
      // would introduce on the split path.
      const tx = this.db.transaction([currentSequenceKey, sequencesToSendKey], 'readwrite');
      // Attach a catch handler immediately so tx.done rejections (e.g. AbortError after
      // put succeeds but before auto-commit) are always handled without blocking.
      // The errorLogged flag prevents double-logging when the outer catch already fired
      // for the same abort (e.g. a put() threw).
      tx.done.catch((e: unknown) => {
        if (!errorLogged) {
          logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
        }
      });
      const sequenceEvents = await tx.objectStore(currentSequenceKey).get(sessionId);

      if (!sequenceEvents) {
        await tx.objectStore(currentSequenceKey).put({ sessionId, events: [event] });
        this.recordSuccess();
        return undefined;
      }

      if (!this.shouldSplitEventsList(sequenceEvents.events, event)) {
        await tx.objectStore(currentSequenceKey).put({ sessionId, events: sequenceEvents.events.concat(event) });
        this.recordSuccess();
        return undefined;
      }

      // Split path: reset sessionCurrentSequence and write the old events to
      // sequencesToSend atomically within the same transaction.
      const eventsToSend = sequenceEvents.events;
      await tx.objectStore(currentSequenceKey).put({ sessionId, events: [event] });
      const sequenceId = await tx.objectStore(sequencesToSendKey).put({
        sessionId,
        events: eventsToSend,
      });

      this.recordSuccess();
      return {
        events: eventsToSend,
        sessionId,
        sequenceId,
      };
    } catch (e) {
      errorLogged = true;
      logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
      this.recordFailure();
    }
    return undefined;
  };

  storeSendingEvents = async (sessionId: number, events: Events) => {
    try {
      const sequenceId = await this.db.put<'sequencesToSend'>(sequencesToSendKey, {
        sessionId: sessionId,
        events: events,
      });
      this.recordSuccess();
      return sequenceId;
    } catch (e) {
      logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
      this.recordFailure();
    }
    return undefined;
  };

  cleanUpSessionEventsStore = async (_sessionId: number, sequenceId?: number) => {
    if (!sequenceId) {
      return;
    }
    try {
      await this.db.delete<'sequencesToSend'>(sequencesToSendKey, sequenceId);
      this.recordSuccess();
    } catch (e) {
      logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
      this.recordFailure();
    }
  };
}
