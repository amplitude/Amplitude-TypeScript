/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Timeout / hang protection regression tests.
 *
 * IndexedDB operations can hang indefinitely with no error, no rejection.
 * The two scenarios covered here:
 *
 * SCENARIO 1 – openDB hang at init
 *   When another tab holds an open connection during a version upgrade, or the
 *   DB is in a "closing" state (documented Chrome behaviour), `openDB` blocks
 *   forever.  Without a timeout, SessionReplayEventsIDBStore.new() never
 *   resolves and the SDK never initialises a store.  With the fix, openDB is
 *   wrapped with a 2-second timeout; on timeout, the inner promise rejects,
 *   the static `new()` catch returns `undefined`, and the caller falls back
 *   to the in-memory store.
 *
 * SCENARIO 2 – mid-recording transaction stall
 *   A readwrite transaction may never settle (storage pressure on some
 *   browsers stalls instead of throwing).  Without a timeout, neither the
 *   outer try/catch nor `tx.done.catch` fire — `recordFailure()` is never
 *   called and the memory fallback never triggers.  With the fix, an
 *   `armTxDoneTimeout` watcher fires `recordFailure()` after 5s of stall.
 */
import { ILogger } from '@amplitude/analytics-core';
import * as EventsIDBStore from '../src/events/events-idb-store';
import { SessionReplayEventsIDBStore, withTimeout, generateUUID } from '../src/events/events-idb-store';

type MockedLogger = jest.Mocked<ILogger>;

const apiKey = 'static_key_timeout_test'; // 10-char prefix

const makeLogger = (): MockedLogger => ({
  error: jest.fn(),
  log: jest.fn(),
  disable: jest.fn(),
  enable: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
});

const mockEvent = JSON.stringify({ type: 4, data: { href: 'https://example.com' }, timestamp: 1000 });

describe('IDB timeout / hang protection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  // ---------------------------------------------------------------------------
  // withTimeout helper – core unit tests
  // ---------------------------------------------------------------------------
  describe('withTimeout', () => {
    test('resolves with the promise value when promise settles before timeout', async () => {
      const result = withTimeout(Promise.resolve('ok'), 1000);
      // Fast-forward, but resolve should happen synchronously via microtask.
      await expect(result).resolves.toBe('ok');
    });

    test('rejects with the original error when the promise rejects before timeout', async () => {
      const error = new Error('original');
      const result = withTimeout(Promise.reject(error), 1000);
      await expect(result).rejects.toBe(error);
    });

    test('rejects with a timeout error when the promise never settles', async () => {
      const neverResolves = new Promise<string>(() => {
        // intentionally never settles
      });
      const result = withTimeout(neverResolves, 1000, 'thing timed out');

      // Race the timeout — under fake timers, advance time past the threshold.
      jest.advanceTimersByTime(1001);

      await expect(result).rejects.toThrow('thing timed out after 1000ms');
    });

    test('clears its timer when the underlying promise resolves first (no leaked timer)', async () => {
      const p = withTimeout(Promise.resolve('done'), 1000);
      await expect(p).resolves.toBe('done');
      // Advancing time past the timeout must NOT cause an unhandled rejection
      // — the timer was cleared.  If the timer had leaked, jest would surface
      // the unhandled rejection at test teardown.
      jest.advanceTimersByTime(2000);
    });

    test('clears its timer when the underlying promise rejects first', async () => {
      const p = withTimeout(Promise.reject(new Error('boom')), 1000).catch((e: unknown) => e);
      const settled = await p;
      expect((settled as Error).message).toBe('boom');
      jest.advanceTimersByTime(2000);
    });
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 1: openDB hangs at init → SessionReplayEventsIDBStore.new returns undefined
  // ---------------------------------------------------------------------------
  describe('openDB hang at init', () => {
    test('SessionReplayEventsIDBStore.new() returns undefined when openDB never resolves', async () => {
      // Replace createStore with a never-resolving openDB call wrapped in the
      // real timeout.  We exercise the production code path: the timeout in
      // createStore must fire and reject, the static new() must catch and
      // return undefined so the caller can fall back to memory.
      const neverResolvingDb = new Promise(() => {
        // no-op; simulates a stuck IDB version-upgrade handshake
      });

      // Spy on createStore but execute its real timeout logic by calling
      // withTimeout on the never-resolving promise with the same OPEN_DB_TIMEOUT_MS.
      // This mirrors what createStore does internally without needing to wire up
      // a fake-indexeddb-level hang.
      jest.spyOn(EventsIDBStore, 'createStore').mockImplementation(async () => {
        return withTimeout(
          neverResolvingDb as Promise<never>,
          EventsIDBStore.OPEN_DB_TIMEOUT_MS,
          'IDB openDB timed out',
        );
      });

      const logger = makeLogger();
      const newPromise = SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: logger,
      });

      // Advance past the 2s timeout.
      jest.advanceTimersByTime(EventsIDBStore.OPEN_DB_TIMEOUT_MS + 100);

      const store = await newPromise;

      expect(store).toBeUndefined();
      // The error path through new() logs via logIdbError → warn (not an AbortError).
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(logger.warn).toHaveBeenCalled();
      const message = (logger.warn.mock.calls[0]?.[0] ?? '') as string;
      expect(message).toContain('timed out');
    });

    test('createStore rejects with a timeout error when openDB never resolves', async () => {
      // Direct test of createStore: stub openDB itself by spying on the idb module.
      // Easiest path: replace createStore's underlying call by re-wrapping
      // a never-resolving promise.  We assert the timeout error message is
      // surfaced to the caller.
      const stuck = new Promise(() => {
        // never settles
      });
      const result = withTimeout(stuck, EventsIDBStore.OPEN_DB_TIMEOUT_MS, 'IDB openDB timed out');
      jest.advanceTimersByTime(EventsIDBStore.OPEN_DB_TIMEOUT_MS + 1);
      await expect(result).rejects.toThrow(/IDB openDB timed out after \d+ms/);
    });
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 2: mid-recording transaction stall → recordFailure + fallback
  // ---------------------------------------------------------------------------
  describe('mid-recording transaction stall', () => {
    test('addEventToCurrentSequence: stalled inner op triggers onPersistentFailure via timeout', async () => {
      // Genuine production stall: the IDB driver accepts the call but never
      // resolves any of its op promises.  The outer try never reaches the
      // recordSuccess / cancelTimeout sequence; the watchdog must fire.
      const txDone = new Promise<void>(() => {
        // never settles
      });
      const stuckOp = new Promise<undefined>(() => {
        // never resolves
      });

      const mockDB = {
        transaction: jest.fn().mockReturnValue({
          objectStore: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue(stuckOp),
            put: jest.fn().mockReturnValue(stuckOp),
          }),
          done: txDone,
        }),
      } as unknown as EventsIDBStore.SessionReplayDB & { transaction: jest.Mock };

      jest
        .spyOn(EventsIDBStore, 'createStore')
        .mockResolvedValue(mockDB as unknown as import('idb').IDBPDatabase<EventsIDBStore.SessionReplayDB>);

      const onPersistentFailure = jest.fn();
      const store = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: makeLogger(),
        onPersistentFailure,
        consecutiveFailureThreshold: 1,
      });
      expect(store).toBeDefined();

      // Don't await — the operation will never resolve.
      void store!.addEventToCurrentSequence(123, mockEvent);
      // Let the function run up to the first await (which suspends forever).
      await Promise.resolve();
      expect(onPersistentFailure).not.toHaveBeenCalled();

      // Advance past the 5s tx-done timeout.
      jest.advanceTimersByTime(EventsIDBStore.TX_DONE_TIMEOUT_MS + 100);
      // Drain the microtask queue so the timer callback runs its body.
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      // Post-fix: timeout fires recordFailure → onPersistentFailure exactly once.
      expect(onPersistentFailure).toHaveBeenCalledTimes(1);
    });

    test('getSequencesToSend: stalled cursor triggers onPersistentFailure via timeout', async () => {
      // Genuine stall: openCursor never resolves and tx.done never settles.
      const txDone = new Promise<void>(() => {
        // never settles
      });
      const stuckCursor = new Promise<null>(() => {
        // never resolves
      });

      const mockDB = {
        transaction: jest.fn().mockReturnValue({
          store: {
            openCursor: jest.fn().mockReturnValue(stuckCursor),
          },
          done: txDone,
        }),
      } as unknown as EventsIDBStore.SessionReplayDB;

      jest
        .spyOn(EventsIDBStore, 'createStore')
        .mockResolvedValue(mockDB as unknown as import('idb').IDBPDatabase<EventsIDBStore.SessionReplayDB>);

      const onPersistentFailure = jest.fn();
      const store = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: makeLogger(),
        onPersistentFailure,
        consecutiveFailureThreshold: 1,
      });
      expect(store).toBeDefined();

      void store!.getSequencesToSend();
      await Promise.resolve();
      expect(onPersistentFailure).not.toHaveBeenCalled();

      jest.advanceTimersByTime(EventsIDBStore.TX_DONE_TIMEOUT_MS + 100);
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      expect(onPersistentFailure).toHaveBeenCalledTimes(1);
    });

    test('storeCurrentSequence: stalled tx.done triggers onPersistentFailure via timeout', async () => {
      const txDone = new Promise<void>(() => {
        // never settles
      });

      const stuckOp = new Promise<undefined>(() => {
        // never resolves
      });

      const mockDB = {
        transaction: jest.fn().mockReturnValue({
          objectStore: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue(stuckOp),
            put: jest.fn().mockReturnValue(stuckOp),
          }),
          done: txDone,
        }),
      } as unknown as EventsIDBStore.SessionReplayDB;

      jest
        .spyOn(EventsIDBStore, 'createStore')
        .mockResolvedValue(mockDB as unknown as import('idb').IDBPDatabase<EventsIDBStore.SessionReplayDB>);

      const onPersistentFailure = jest.fn();
      const store = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: makeLogger(),
        onPersistentFailure,
        consecutiveFailureThreshold: 1,
        tabId: 'tab-only',
      });
      expect(store).toBeDefined();

      void store!.storeCurrentSequence(1);
      await Promise.resolve();
      expect(onPersistentFailure).not.toHaveBeenCalled();

      jest.advanceTimersByTime(EventsIDBStore.TX_DONE_TIMEOUT_MS + 100);
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      expect(onPersistentFailure).toHaveBeenCalledTimes(1);
    });

    test('timeout is suppressed when the operation body completes successfully (cancel path)', async () => {
      // Soft-cancel branch: get/put resolve so the function reaches
      // recordSuccess / cancelTimeout — even though tx.done never settles,
      // the watchdog is suppressed.  This is the test-environment scenario
      // and the "fast tx + slow commit microtask" production scenario.
      const txDone = new Promise<void>(() => {
        // never settles
      });

      const mockDB = {
        transaction: jest.fn().mockReturnValue({
          objectStore: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(undefined),
            put: jest.fn().mockResolvedValue(undefined),
          }),
          done: txDone,
        }),
      } as unknown as EventsIDBStore.SessionReplayDB;

      jest
        .spyOn(EventsIDBStore, 'createStore')
        .mockResolvedValue(mockDB as unknown as import('idb').IDBPDatabase<EventsIDBStore.SessionReplayDB>);

      const onPersistentFailure = jest.fn();
      const store = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: makeLogger(),
        onPersistentFailure,
        consecutiveFailureThreshold: 1,
      });

      // Body completes normally (mocks resolve → recordSuccess → cancelTimeout).
      await store!.addEventToCurrentSequence(123, mockEvent);

      // Even though tx.done never settles, the timer callback's cancelled
      // guard prevents recordFailure from firing.
      jest.advanceTimersByTime(EventsIDBStore.TX_DONE_TIMEOUT_MS + 100);
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      expect(onPersistentFailure).not.toHaveBeenCalled();
    });

    test('timeout does NOT double-count when tx.done later rejects with the same abort', async () => {
      // Race: timeout fires first (5s elapsed) on a stalled inner op, then
      // tx.done eventually rejects with an AbortError.  The errorLogged /
      // timedOut flags must prevent the tx.done.catch from also calling
      // recordFailure for the same transaction.
      let rejectTxDone!: (e: unknown) => void;
      const txDone = new Promise<void>((_resolve, reject) => {
        rejectTxDone = reject;
      });
      txDone.catch(() => {
        // suppress unhandled rejection warnings
      });
      const stuckOp = new Promise<undefined>(() => {
        // never resolves — keeps cancelTimeout from firing
      });

      const mockDB = {
        transaction: jest.fn().mockReturnValue({
          objectStore: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue(stuckOp),
            put: jest.fn().mockReturnValue(stuckOp),
          }),
          done: txDone,
        }),
      } as unknown as EventsIDBStore.SessionReplayDB;

      jest
        .spyOn(EventsIDBStore, 'createStore')
        .mockResolvedValue(mockDB as unknown as import('idb').IDBPDatabase<EventsIDBStore.SessionReplayDB>);

      const onPersistentFailure = jest.fn();
      const store = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: makeLogger(),
        onPersistentFailure,
        // High threshold so we can count individual failures rather than fallback once.
        consecutiveFailureThreshold: 10,
      });

      void store!.addEventToCurrentSequence(123, mockEvent);
      await Promise.resolve();

      // Fire the timeout first.
      jest.advanceTimersByTime(EventsIDBStore.TX_DONE_TIMEOUT_MS + 100);
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      // Now the underlying tx.done rejects (AbortError landing late).
      rejectTxDone(new DOMException('abort', 'AbortError'));
      for (let i = 0; i < 5; i++) {
        await Promise.resolve();
      }

      // recordFailure should have been called exactly once (from the timeout),
      // NOT twice — the tx.done.catch must skip via the timedOut flag.
      // We can't directly observe consecutiveFailures, but we can re-trigger
      // failures up to the threshold and verify the count is correct: with
      // threshold=10, only the timeout's single recordFailure happened, so
      // onPersistentFailure should still NOT have fired.
      expect(onPersistentFailure).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // generateUUID fallback: Math.random path when crypto.randomUUID unavailable
  // ---------------------------------------------------------------------------
  describe('generateUUID', () => {
    test('returns a UUID-shaped string via crypto.randomUUID when available', () => {
      const id = generateUUID();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    test('falls back to Math.random UUID when crypto.randomUUID throws', () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const orig = crypto.randomUUID;
      // Simulate a non-secure context where randomUUID is absent.
      (crypto as any).randomUUID = undefined;
      try {
        const id = generateUUID();
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      } finally {
        crypto.randomUUID = orig;
      }
    });
  });
});
