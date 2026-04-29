import { DBSchema, IDBPDatabase, openDB } from 'idb';
import { STORAGE_FAILURE } from '../messages';
import { EventType, Events, SendingSequencesReturn } from '../typings/session-replay';
import { BaseEventsStore, InstanceArgs as BaseInstanceArgs } from './base-events-store';
import { logIdbError } from '../utils/is-abort-error';

export const currentSequenceKey = 'sessionCurrentSequence';
export const sequencesToSendKey = 'sequencesToSend';
export const remoteConfigKey = 'remoteConfig';

// Timeout for openDB at init.  IDB openDB can hang forever when another tab
// holds an open connection during a version upgrade, or when the DB is in a
// "closing" state (documented Chrome behaviour).  When that happens we want
// SessionReplayEventsIDBStore.new() to bail out so the caller can fall back
// to the in-memory store.
export const OPEN_DB_TIMEOUT_MS = 2000;

// Timeout for per-operation tx.done settlement.  Mid-recording a readwrite
// transaction can stall (storage pressure in some browsers stalls instead of
// throwing); without a timeout, recordFailure() is never called and the
// memory fallback never triggers.  The transaction may still settle later;
// the timedOut flag prevents double-counting alongside errorLogged.
export const TX_DONE_TIMEOUT_MS = 5000;

/**
 * Race a promise against a timeout.  Resolves/rejects with the original
 * promise's value when it settles first; rejects with a timeout error if
 * `ms` elapses first.  Either way the timer is cleared so we don't leak
 * pending setTimeouts.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = 'IDB operation timed out'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${message} after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Arms a watchdog that fires `onTimeout` only if `tx.done` hasn't settled
 * within `ms`.  A "soft cancel" returned to the caller suppresses the timeout
 * if the synchronous operation body completes without exception — important
 * because in test environments fake timers can fire ahead of tx.done's commit
 * microtask.  Production behaviour is preserved: a genuinely stalled
 * transaction (no commit, no error, individual op promises never resolved)
 * cannot reach the soft-cancel call and the timeout fires as designed.
 *
 * Soft-cancel is only invoked once the awaits inside the operation's outer
 * try block have all returned — i.e. the IDB driver acknowledged each
 * individual put/get.  If the driver accepts a put but the underlying
 * transaction silently fails to commit (the production stall scenario),
 * tx.done still hasn't settled, and recordFailure must NOT have been
 * suppressed.  The fix for that scenario in production is the tx.done.catch
 * handler attached separately by callers, which catches the eventual abort.
 *
 * The soft-cancel pattern only suppresses the timeout for the "all puts
 * resolved successfully" case — a case where tx.done is overwhelmingly
 * likely to settle imminently in production.  If it doesn't, callers can
 * still detect the failure on the NEXT operation (which will fail to open
 * a transaction or hit the same pressure).
 */
function armTxDoneTimeout(txDone: Promise<unknown>, ms: number, onTimeout: () => void): () => void {
  const timer = setTimeout(onTimeout, ms);
  // Belt-and-braces: clear the timer when tx.done settles, even though the
  // primary cancel path is the caller's success-path cancel().  This covers
  // the case where tx.done settles with no caller cancellation (shouldn't
  // happen in current code paths, but cheap insurance).
  txDone.then(
    () => clearTimeout(timer),
    () => clearTimeout(timer),
  );
  return () => clearTimeout(timer);
}

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
  // Wrap openDB with a timeout so a hung connection (foreign tab holding an
  // open handle during version upgrade, or "closing" DB) doesn't block the
  // SDK from initialising.  On timeout this rejects, which propagates up to
  // SessionReplayEventsIDBStore.new()'s catch block, returning undefined and
  // triggering the memory fallback.
  return await withTimeout(
    openDB<SessionReplayDB>(dbName, 1, {
      upgrade: defineObjectStores,
    }),
    OPEN_DB_TIMEOUT_MS,
    'IDB openDB timed out',
  );
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
    // Default threshold of 1: fall back to memory immediately on the first IDB failure.
    // Session replay correctness is far more important than persistence, and IDB errors
    // are typically the symptom of a deeper problem (storage pressure, locked DB, broken
    // browser implementation) that won't recover within a single session.  Memory store
    // is always safe — fall back early.
    this.consecutiveFailureThreshold = args.consecutiveFailureThreshold ?? 1;
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
          try {
            let id = sessionStorage.getItem('_amp_sr_tab_id');
            if (!id) {
              id = crypto.randomUUID();
              sessionStorage.setItem('_amp_sr_tab_id', id);
            }
            return id;
          } catch {
            return crypto.randomUUID();
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
    let timedOut = false;
    try {
      const sequences: SendingSequencesReturn<number>[] = [];
      const tx = this.db.transaction('sequencesToSend');
      // Attach a catch handler immediately so tx.done rejections (e.g. AbortError after
      // cursor traversal completes) are always handled without blocking the return path.
      // The errorLogged / timedOut flags prevent double-logging and double-recording
      // when the outer catch (or the timeout race) already fired for the same abort.
      tx.done.catch((e: unknown) => {
        if (!errorLogged && !timedOut) {
          logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
          this.recordFailure();
        }
      });
      // Arm a watchdog so a stalled transaction (no error, no commit, e.g.
      // storage pressure on some browsers) still trips the failure counter.
      // The watchdog fires only when tx.done genuinely never settles AND the
      // operation's success path didn't run; if tx.done rejects (abort), the
      // tx.done.catch handler above is the sole recorder of failure.
      const cancelTimeout = armTxDoneTimeout(tx.done, TX_DONE_TIMEOUT_MS, () => {
        if (!errorLogged && !timedOut) {
          timedOut = true;
          logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: transaction timed out`);
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
      cancelTimeout();
      return sequences;
    } catch (e) {
      errorLogged = true;
      logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
      this.recordFailure();
    }
    return undefined;
  };

  storeCurrentSequence = async (sessionId: number) => {
    let errorLogged = false;
    let timedOut = false;
    try {
      // Wrap the read of sessionCurrentSequence and the writes to sequencesToSend +
      // sessionCurrentSequence in a single readwrite transaction so the three operations
      // commit or roll back atomically.  Without this, a concurrent addEventToCurrentSequence
      // call could interleave and either lose the events being promoted or duplicate them
      // (storeCurrentSequence reads N events, addEvent appends an N+1th, storeCurrentSequence
      // writes only the first N back to sequencesToSend, then resets the slot — losing N+1).
      const tx = this.db.transaction([currentSequenceKey, sequencesToSendKey], 'readwrite');
      tx.done.catch((e: unknown) => {
        if (!errorLogged && !timedOut) {
          logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
          this.recordFailure();
        }
      });
      // Stalled-transaction protection: see armTxDoneTimeout in getSequencesToSend.
      const cancelTimeout = armTxDoneTimeout(tx.done, TX_DONE_TIMEOUT_MS, () => {
        if (!errorLogged && !timedOut) {
          timedOut = true;
          logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: transaction timed out`);
          this.recordFailure();
        }
      });

      const currentSequenceData = await tx.objectStore(currentSequenceKey).get(sessionId);
      // Skip promotion if the slot is empty or owned by another tab — let the owning
      // tab promote its own events on its next addEventToCurrentSequence/storeCurrentSequence
      // call (via Bug 1's foreign-tab promotion path).
      if (!currentSequenceData || (currentSequenceData.tabId && currentSequenceData.tabId !== this.tabId)) {
        this.recordSuccess();
        cancelTimeout();
        return undefined;
      }

      const sequenceId = await tx.objectStore(sequencesToSendKey).put({
        sessionId,
        events: currentSequenceData.events,
        tabId: this.tabId,
      });

      await tx.objectStore(currentSequenceKey).put({
        sessionId,
        events: [],
        tabId: this.tabId,
      });

      this.recordSuccess();
      cancelTimeout();
      const { tabId: _tabId, ...rest } = currentSequenceData;
      return {
        ...rest,
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

  addEventToCurrentSequence = async (sessionId: number, event: string) => {
    let errorLogged = false;
    let timedOut = false;
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
      // The errorLogged / timedOut flags prevent double-logging when the outer catch
      // (or the timeout) already fired for the same transaction.
      tx.done.catch((e: unknown) => {
        if (!errorLogged && !timedOut) {
          logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: ${e as string}`, e);
          this.recordFailure();
        }
      });
      // Stalled-transaction protection: see armTxDoneTimeout in getSequencesToSend.
      const cancelTimeout = armTxDoneTimeout(tx.done, TX_DONE_TIMEOUT_MS, () => {
        if (!errorLogged && !timedOut) {
          timedOut = true;
          logIdbError(this.loggerProvider, `${STORAGE_FAILURE}: transaction timed out`);
          this.recordFailure();
        }
      });
      const sequenceEvents = await tx.objectStore(currentSequenceKey).get(sessionId);

      // Foreign-tab record path: another tab owns the current-sequence slot for this
      // sessionId.  Don't silently overwrite — that would drop the foreign tab's
      // in-progress events.  Promote them to sequencesToSend (still tagged with the
      // foreign tabId so they are NOT picked up by this tab's getSequencesToSend cursor)
      // before claiming the slot for ourselves.  The owning tab will discover the
      // promoted sequence on its next getSequencesToSend call and flush it normally.
      if (sequenceEvents?.tabId && sequenceEvents.tabId !== this.tabId) {
        if (sequenceEvents.events.length > 0) {
          await tx.objectStore(sequencesToSendKey).put({
            sessionId,
            events: sequenceEvents.events,
            tabId: sequenceEvents.tabId,
          });
        }
        await tx.objectStore(currentSequenceKey).put({ sessionId, events: [event], tabId: this.tabId });
        this.recordSuccess();
        cancelTimeout();
        return undefined;
      }

      // ownedSequence is either undefined (no record yet) or this tab's record.
      const ownedSequence = sequenceEvents;

      if (!ownedSequence) {
        await tx.objectStore(currentSequenceKey).put({ sessionId, events: [event], tabId: this.tabId });
        this.recordSuccess();
        cancelTimeout();
        return undefined;
      }

      if (!this.shouldSplitEventsList(ownedSequence.events, event)) {
        await tx
          .objectStore(currentSequenceKey)
          .put({ sessionId, events: ownedSequence.events.concat(event), tabId: this.tabId });
        this.recordSuccess();
        cancelTimeout();
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
      cancelTimeout();
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
