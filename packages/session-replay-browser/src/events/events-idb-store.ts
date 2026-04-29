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
    value: Omit<SendingSequencesReturn<number>, 'sequenceId'> & { tabId?: string };
  };
  sequencesToSend: {
    key: number;
    value: Omit<SendingSequencesReturn<number>, 'sequenceId'> & { tabId?: string };
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
  tabId: string;
  onPersistentFailure?: () => void;
  consecutiveFailureThreshold?: number;
} & BaseInstanceArgs;

export class SessionReplayEventsIDBStore extends BaseEventsStore<number> {
  private readonly db: IDBPDatabase<SessionReplayDB>;
  private readonly tabId: string;
  private readonly onPersistentFailure?: () => void;
  private readonly consecutiveFailureThreshold: number;
  private consecutiveFailures = 0;
  private hasTriggeredFallback = false;

  constructor(args: InstanceArgs) {
    super(args);
    this.db = args.db;
    this.tabId = args.tabId;
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

  static async new(
    type: EventType,
    args: Omit<InstanceArgs, 'db' | 'tabId'> & { tabId?: string },
  ): Promise<SessionReplayEventsIDBStore | undefined> {
    try {
      const dbSuffix = type === 'replay' ? '' : `_${type}`;
      const dbName = `${args.apiKey.substring(0, 10)}_amp_session_replay_events${dbSuffix}`;
      const db = await createStore(dbName);
      const tabId =
        args.tabId ??
        (() => {
          const generateId = () =>
            // eslint-disable-next-line @typescript-eslint/no-magic-numbers
            'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              // eslint-disable-next-line @typescript-eslint/no-magic-numbers
              const r = (Math.random() * 16) | 0;
              // eslint-disable-next-line @typescript-eslint/no-magic-numbers
              return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
            });
          try {
            let id = sessionStorage.getItem('_amp_sr_tab_id');
            if (!id) {
              id = generateId();
              sessionStorage.setItem('_amp_sr_tab_id', id);
            }
            return id;
          } catch {
            return generateId();
          }
        })();
      return new SessionReplayEventsIDBStore({
        ...args,
        db,
        tabId,
      });
    } catch (e) {
      logIdbError(args.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
    }
    return;
  }

  async getCurrentSequenceEvents(sessionId?: number) {
    if (sessionId) {
      const record = await this.db.get('sessionCurrentSequence', sessionId);
      if (!record) {
        return undefined;
      }
      const { tabId: _tabId, ...rest } = record;
      return [rest];
    }

    const allEvents = [];
    for (const record of await this.db.getAll('sessionCurrentSequence')) {
      const { tabId: _tabId, ...rest } = record;
      allEvents.push(rest);
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
          this.recordFailure();
        }
      });
      let cursor = await tx.store.openCursor();
      while (cursor) {
        const { sessionId, events, tabId } = cursor.value;
        // Only include records owned by this tab; untagged legacy records are included
        // for backward compatibility with data written before tab-keying was added.
        if (!tabId || tabId === this.tabId) {
          sequences.push({
            events,
            sequenceId: cursor.key,
            sessionId,
          });
        }
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
        tabId: this.tabId,
      });

      await this.db.put<'sessionCurrentSequence'>(currentSequenceKey, {
        sessionId,
        events: [],
        tabId: this.tabId,
      });

      this.recordSuccess();
      const { tabId: _tabId, ...rest } = currentSequenceData;
      return {
        ...rest,
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
          this.recordFailure();
        }
      });
      const sequenceEvents = await tx.objectStore(currentSequenceKey).get(sessionId);

      // Treat as empty if this record belongs to a different tab (same sessionId, different tab).
      const ownedSequence = sequenceEvents?.tabId && sequenceEvents.tabId !== this.tabId ? undefined : sequenceEvents;

      if (!ownedSequence) {
        await tx.objectStore(currentSequenceKey).put({ sessionId, events: [event], tabId: this.tabId });
        this.recordSuccess();
        return undefined;
      }

      if (!this.shouldSplitEventsList(ownedSequence.events, event)) {
        await tx
          .objectStore(currentSequenceKey)
          .put({ sessionId, events: ownedSequence.events.concat(event), tabId: this.tabId });
        this.recordSuccess();
        return undefined;
      }

      // Split path: reset sessionCurrentSequence and write the old events to
      // sequencesToSend atomically within the same transaction.
      const eventsToSend = ownedSequence.events;
      await tx.objectStore(currentSequenceKey).put({ sessionId, events: [event], tabId: this.tabId });
      const sequenceId = await tx.objectStore(sequencesToSendKey).put({
        sessionId,
        events: eventsToSend,
        tabId: this.tabId,
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
        tabId: this.tabId,
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
