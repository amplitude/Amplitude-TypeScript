/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Multi-tab IDB contamination regression tests.
 *
 * These tests demonstrate two bugs that occur when two tabs share the same
 * IndexedDB database (keyed only on apiKey.substring(0,10)):
 *
 * BUG 1 – Cross-tab sequence reads:
 *   getSequencesToSend() does a full cursor scan with no session/tab filter.
 *   Tab A can read and return sequences that were written by Tab B.
 *
 * BUG 2 – AbortError does not trigger fallback:
 *   Concurrent readwrite transactions on overlapping object stores produce
 *   AbortErrors.  The AbortError lands only in tx.done.catch(), which never
 *   calls recordFailure(), so consecutiveFailures never reaches the threshold
 *   and onPersistentFailure() is never invoked — the fallback to memory store
 *   is silently skipped.
 *
 * Each test is written to FAIL on the current code and PASS after the fix.
 */

import { IDBFactory } from 'fake-indexeddb';
import { ILogger } from '@amplitude/analytics-core';
import * as EventsIDBStore from '../src/events/events-idb-store';
import { SessionReplayEventsIDBStore } from '../src/events/events-idb-store';

type MockedLogger = jest.Mocked<ILogger>;

const apiKey = 'static_key_multitab'; // 10-char prefix: "static_key"

const makeLogger = (): MockedLogger => ({
  error: jest.fn(),
  log: jest.fn(),
  disable: jest.fn(),
  enable: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
});

const mockEvent = JSON.stringify({ type: 4, data: { href: 'https://example.com' }, timestamp: 1000 });
const mockEvent2 = JSON.stringify({ type: 2, data: { href: 'https://example.com' }, timestamp: 2000 });

/**
 * Point both IDBStore instances at the same IDBFactory so they genuinely share
 * a database, matching the real browser multi-tab scenario.
 */
function useSharedIDBFactory() {
  const factory = new IDBFactory();
  // Swap out the global indexedDB for the duration of this test block.
  // jest-setup.js resets it per-test; we override inside the test itself.
  const restore = () => {
    global.indexedDB = new IDBFactory();
  };
  global.indexedDB = factory;
  return { factory, restore };
}

describe('multi-tab IDB contamination', () => {
  afterEach(() => {
    jest.resetAllMocks();
    // Restore to a fresh factory (matching jest-setup.js behaviour).
    global.indexedDB = new IDBFactory();
  });

  // ---------------------------------------------------------------------------
  // BUG 1: getSequencesToSend() returns sequences belonging to the other tab
  // ---------------------------------------------------------------------------
  describe('BUG 1 – cross-tab sequence contamination', () => {
    test('tab A should NOT read sequences written by tab B', async () => {
      const { restore } = useSharedIDBFactory();
      try {
        const loggerA = makeLogger();
        const loggerB = makeLogger();

        // Two instances, different logical "tabs", but same IDB database name.
        const tabA = await SessionReplayEventsIDBStore.new('replay', {
          apiKey,
          loggerProvider: loggerA,
        });
        const tabB = await SessionReplayEventsIDBStore.new('replay', {
          apiKey,
          loggerProvider: loggerB,
        });

        expect(tabA).toBeDefined();
        expect(tabB).toBeDefined();

        // Tab B stores a sequence under session 9999.
        await tabB!.storeSendingEvents(9999, [mockEvent2]);

        // Tab A stores its own sequence under session 1111.
        await tabA!.storeSendingEvents(1111, [mockEvent]);

        // Tab A asks for sequences to send.  On the current (buggy) code it
        // receives a cursor over ALL sequences in the shared DB — including
        // Tab B's session 9999 entry.  After the fix it should only see its
        // own sequences (keyed by a tab/instance identifier).
        const sequencesSeenByA = await tabA!.getSequencesToSend();

        // EXPECTED (post-fix): Tab A only sees its own session 1111.
        // ACTUAL (pre-fix): Tab A also sees session 9999 from Tab B → FAILS.
        expect(sequencesSeenByA).toBeDefined();
        const sessionIdsSeen = (sequencesSeenByA ?? []).map((s) => s.sessionId);
        expect(sessionIdsSeen).toContain(1111);
        expect(sessionIdsSeen).not.toContain(9999); // BUG: currently this assertion fails
      } finally {
        restore();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // BUG 2: AbortErrors from concurrent writes do not trigger the fallback
  // ---------------------------------------------------------------------------
  describe('BUG 2 – AbortError from tx.done.catch never calls recordFailure', () => {
    test('AbortErrors occurring only in tx.done.catch should trigger onPersistentFailure after threshold', async () => {
      /**
       * The current code has:
       *
       *   tx.done.catch((e) => {
       *     if (!errorLogged) {
       *       logIdbError(…);   // ← logs only, NO recordFailure() call
       *     }
       *   });
       *
       * So when the outer try/catch never fires (put() succeeds but the
       * transaction later aborts at commit time), consecutiveFailures is never
       * incremented and onPersistentFailure() is never called.
       *
       * After the fix, recordFailure() should also be called from tx.done.catch
       * when the error is NOT an AbortError (or unconditionally, depending on
       * the chosen fix strategy — see the bug description for details).
       *
       * Here we simulate the exact scenario: put() resolves successfully (outer
       * try succeeds, recordSuccess() is called), but tx.done later rejects —
       * a common occurrence under IDB transaction abort due to storage pressure
       * or concurrent writes.  We verify that the consecutive-failure counter
       * is incremented by the tx.done.catch path.
       */
      const abortError = new DOMException(
        'The transaction was aborted, so the request cannot be fulfilled.',
        'AbortError',
      );

      // Build a txDone promise that rejects AFTER the put resolves, matching
      // real IDB behaviour where the transaction aborts at commit time.
      let rejectTxDone!: (e: unknown) => void;
      const txDone = new Promise<void>((_resolve, reject) => {
        rejectTxDone = reject;
      });
      // Suppress unhandled-rejection warnings from Jest.
      txDone.catch(() => {
        // handled by the store's tx.done.catch
      });

      const mockDB = {
        transaction: jest.fn().mockReturnValue({
          objectStore: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(undefined),
            put: jest.fn().mockImplementation(() => {
              // Trigger the abort *after* put resolves so the outer try block
              // completes successfully (recordSuccess() fires), but tx.done
              // still rejects — this is the "silent drop" scenario.
              void Promise.resolve().then(() => rejectTxDone(abortError));
              return Promise.resolve(undefined);
            }),
          }),
          done: txDone,
        }),
      } as unknown as EventsIDBStore.SessionReplayDB & {
        transaction: jest.Mock;
      };

      jest
        .spyOn(EventsIDBStore, 'createStore')
        .mockResolvedValue(mockDB as unknown as import('idb').IDBPDatabase<EventsIDBStore.SessionReplayDB>);

      const onPersistentFailure = jest.fn();
      const store = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: makeLogger(),
        onPersistentFailure,
        consecutiveFailureThreshold: 1, // trigger on first failure
      });

      expect(store).toBeDefined();

      // Trigger addEventToCurrentSequence.  The outer try succeeds (put
      // resolves), recordSuccess() fires — but tx.done then rejects with an
      // AbortError.  Currently recordFailure() is NOT called from tx.done.catch,
      // so onPersistentFailure never fires.
      await store!.addEventToCurrentSequence(123, mockEvent);

      // Allow the microtask queue to drain so tx.done.catch fires.
      await Promise.resolve();
      await Promise.resolve();

      // EXPECTED (post-fix): onPersistentFailure called once.
      // ACTUAL (pre-fix): onPersistentFailure never called → this assertion FAILS.
      expect(onPersistentFailure).toHaveBeenCalledTimes(1); // BUG: currently 0
    });

    test('AbortError from getSequencesToSend tx.done.catch should also trigger onPersistentFailure', async () => {
      const abortError = new DOMException(
        'The transaction was aborted, so the request cannot be fulfilled.',
        'AbortError',
      );

      let rejectTxDone!: (e: unknown) => void;
      const txDone = new Promise<void>((_resolve, reject) => {
        rejectTxDone = reject;
      });
      txDone.catch(() => {
        // handled
      });

      const mockDB = {
        transaction: jest.fn().mockReturnValue({
          store: {
            openCursor: jest.fn().mockImplementation(() => {
              // openCursor() resolves with null (no records); abort fires after.
              void Promise.resolve().then(() => rejectTxDone(abortError));
              return Promise.resolve(null);
            }),
          },
          done: txDone,
        }),
      };

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

      await store!.getSequencesToSend();

      // Allow microtasks to settle so tx.done.catch fires.
      await Promise.resolve();
      await Promise.resolve();

      // EXPECTED (post-fix): onPersistentFailure called once.
      // ACTUAL (pre-fix): never called → FAILS.
      expect(onPersistentFailure).toHaveBeenCalledTimes(1); // BUG: currently 0
    });
  });
});
