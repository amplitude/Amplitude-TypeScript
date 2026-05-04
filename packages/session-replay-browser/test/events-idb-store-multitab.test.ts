/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Multi-tab IDB contamination regression tests.
 *
 * These tests demonstrate / regression-guard a family of bugs that occur when two tabs
 * share the same IndexedDB database (keyed only on apiKey.substring(0,10)):
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
 * BUG 3 – addEventToCurrentSequence drops cross-tab events:
 *   When Tab A sees a sessionCurrentSequence record owned by Tab B, the original
 *   code simply overwrote it with [event] and Tab A's tabId, dropping Tab B's
 *   in-progress events entirely.  Two tabs sharing a sessionId would ping-pong
 *   overwriting each other and lose most events.
 *
 * BUG 4 – storeCurrentSequence is not transactional:
 *   The original implementation used three separate IDB requests, allowing a
 *   concurrent addEventToCurrentSequence call to interleave between the read
 *   and the write — losing events appended after the read.
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

        // Two instances share the same IDB database name but have distinct tabIds,
        // simulating two browser tabs open to the same page.
        const tabA = await SessionReplayEventsIDBStore.new('replay', {
          apiKey,
          loggerProvider: loggerA,
          tabId: 'tab-a',
        });
        const tabB = await SessionReplayEventsIDBStore.new('replay', {
          apiKey,
          loggerProvider: loggerB,
          tabId: 'tab-b',
        });

        expect(tabA).toBeDefined();
        expect(tabB).toBeDefined();

        // Tab B stores a sequence under session 9999.
        await tabB!.storeSendingEvents(9999, [mockEvent2]);

        // Tab A stores its own sequence under session 1111.
        await tabA!.storeSendingEvents(1111, [mockEvent]);

        // Tab A asks for sequences to send. With the fix, records are stamped
        // with tabId and the cursor skips records belonging to other tabs.
        const sequencesSeenByA = await tabA!.getSequencesToSend();

        expect(sequencesSeenByA).toBeDefined();
        const sessionIdsSeen = (sequencesSeenByA ?? []).map((s) => s.sessionId);
        expect(sessionIdsSeen).toEqual([1111]); // Tab A sees only its own session
        expect(sessionIdsSeen).not.toContain(9999); // Tab B's session is filtered out
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

  // ---------------------------------------------------------------------------
  // BUG 3: addEventToCurrentSequence drops events from the foreign tab
  // ---------------------------------------------------------------------------
  describe('BUG 3 – addEventToCurrentSequence cross-tab event drop', () => {
    test('Tab A promotes Tab B in-progress events to sequencesToSend instead of dropping them', async () => {
      const { restore } = useSharedIDBFactory();
      try {
        const tabA = await SessionReplayEventsIDBStore.new('replay', {
          apiKey,
          loggerProvider: makeLogger(),
          tabId: 'tab-a',
        });
        const tabB = await SessionReplayEventsIDBStore.new('replay', {
          apiKey,
          loggerProvider: makeLogger(),
          tabId: 'tab-b',
        });

        expect(tabA).toBeDefined();
        expect(tabB).toBeDefined();

        const sessionId = 555;

        // Tab B records three events for the shared session.
        const b1 = JSON.stringify({ type: 4, src: 'b', n: 1 });
        const b2 = JSON.stringify({ type: 2, src: 'b', n: 2 });
        const b3 = JSON.stringify({ type: 3, src: 'b', n: 3 });
        await tabB!.addEventToCurrentSequence(sessionId, b1);
        await tabB!.addEventToCurrentSequence(sessionId, b2);
        await tabB!.addEventToCurrentSequence(sessionId, b3);

        // Tab A now records its first event for the shared session.  In the buggy
        // implementation this overwrites the slot with just [a1] under tab-a's
        // tabId, dropping b1/b2/b3 entirely.  The fix promotes b1/b2/b3 to
        // sequencesToSend (still tagged with tab-b) so they survive.
        const a1 = JSON.stringify({ type: 4, src: 'a', n: 1 });
        await tabA!.addEventToCurrentSequence(sessionId, a1);

        // Tab A's view: should only see its own ([a1]) sequence in current; should
        // NOT see tab-b's events promoted with tab-b's tabId, because the cursor
        // filters by tabId.
        const aCurrent = await tabA!.getCurrentSequenceEvents(sessionId);
        expect(aCurrent).toEqual([{ events: [a1], sessionId }]);

        // The promoted tab-b sequence is in sequencesToSend tagged tab-b — only
        // tab-b's getSequencesToSend cursor will pick it up.
        const tabASequences = await tabA!.getSequencesToSend();
        expect(tabASequences).toEqual([]); // tab-a sees none of tab-b's promoted records
        const tabBSequences = await tabB!.getSequencesToSend();
        expect(tabBSequences).toEqual([{ sessionId, sequenceId: expect.any(Number), events: [b1, b2, b3] }]);
      } finally {
        restore();
      }
    });

    test('foreign-tab promotion is a no-op when the foreign sequence is empty', async () => {
      // Edge case: sessionCurrentSequence may be { events: [] } (e.g. immediately
      // after a successful storeCurrentSequence reset).  Promoting an empty array
      // into sequencesToSend would create a useless empty sequence.
      const { restore } = useSharedIDBFactory();
      try {
        const tabA = await SessionReplayEventsIDBStore.new('replay', {
          apiKey,
          loggerProvider: makeLogger(),
          tabId: 'tab-a',
        });
        const tabB = await SessionReplayEventsIDBStore.new('replay', {
          apiKey,
          loggerProvider: makeLogger(),
          tabId: 'tab-b',
        });

        const sessionId = 777;

        // Tab B writes an event then promotes it via storeCurrentSequence so the
        // current-sequence slot ends up { events: [], tabId: tab-b }.
        await tabB!.addEventToCurrentSequence(sessionId, JSON.stringify({ b: 1 }));
        await tabB!.storeCurrentSequence(sessionId);

        // Tab A claims the slot.  No empty record should land in sequencesToSend
        // for tab-b on top of the existing one.
        const a1 = JSON.stringify({ a: 1 });
        await tabA!.addEventToCurrentSequence(sessionId, a1);

        // Only the original tab-b sequence is present in tab-b's view; no extra
        // empty record was written.
        const tabBSequences = await tabB!.getSequencesToSend();
        expect(tabBSequences).toHaveLength(1);
        expect(tabBSequences![0].events).toHaveLength(1);
      } finally {
        restore();
      }
    });

    test('both tabs eventually see ALL events from both tabs in sequencesToSend (no events dropped)', async () => {
      // End-to-end invariant: when two tabs interleave addEventToCurrentSequence
      // calls on the same sessionId, every event eventually lands in some
      // sequence-to-send (visible to its owning tab).  Total events in === total
      // events out (across both tabs' views combined).
      const { restore } = useSharedIDBFactory();
      try {
        const tabA = await SessionReplayEventsIDBStore.new('replay', {
          apiKey,
          loggerProvider: makeLogger(),
          tabId: 'tab-a',
        });
        const tabB = await SessionReplayEventsIDBStore.new('replay', {
          apiKey,
          loggerProvider: makeLogger(),
          tabId: 'tab-b',
        });

        const sessionId = 888;
        const aEvents = Array.from({ length: 5 }, (_, i) => JSON.stringify({ src: 'a', n: i }));
        const bEvents = Array.from({ length: 5 }, (_, i) => JSON.stringify({ src: 'b', n: i }));

        // Interleave A and B writes; this is the ping-pong scenario.
        for (let i = 0; i < 5; i++) {
          await tabA!.addEventToCurrentSequence(sessionId, aEvents[i]);
          await tabB!.addEventToCurrentSequence(sessionId, bEvents[i]);
        }

        // Both tabs flush their current sequences to sequencesToSend.
        await tabA!.storeCurrentSequence(sessionId);
        await tabB!.storeCurrentSequence(sessionId);

        const tabASeqs = (await tabA!.getSequencesToSend()) ?? [];
        const tabBSeqs = (await tabB!.getSequencesToSend()) ?? [];
        const allEvents = [...tabASeqs.flatMap((s) => s.events), ...tabBSeqs.flatMap((s) => s.events)];

        // Every single event from both tabs must appear exactly once across the
        // combined view (no drops, no duplicates).
        const expected = [...aEvents, ...bEvents].sort();
        expect(allEvents.slice().sort()).toEqual(expected);
      } finally {
        restore();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // BUG 4: storeCurrentSequence atomicity under concurrent writes
  // ---------------------------------------------------------------------------
  describe('BUG 4 – storeCurrentSequence atomicity', () => {
    test('storeCurrentSequence does not drop events appended concurrently by addEventToCurrentSequence', async () => {
      // The bug: with three separate transactions (db.get, db.put sequencesToSend,
      // db.put sessionCurrentSequence), a concurrent addEvent can interleave between
      // the read and the reset, and the appended event is then overwritten by the
      // reset to [].  With the fix, the entire promote+reset is wrapped in one
      // readwrite transaction, so addEvent is queued by IDB until storeCurrentSequence
      // commits — the appended event survives.
      const { restore } = useSharedIDBFactory();
      try {
        const store = await SessionReplayEventsIDBStore.new('replay', {
          apiKey,
          loggerProvider: makeLogger(),
          tabId: 'tab-only',
        });
        expect(store).toBeDefined();

        const sessionId = 12345;

        // Seed the current sequence with a few events.
        await store!.addEventToCurrentSequence(sessionId, JSON.stringify({ pre: 1 }));
        await store!.addEventToCurrentSequence(sessionId, JSON.stringify({ pre: 2 }));

        // Race storeCurrentSequence against several concurrent addEvent calls.
        // IDB serializes overlapping readwrite transactions, so the addEvent calls
        // must either land before storeCurrentSequence (becoming part of the
        // promoted sequence) or after it (landing in a fresh current sequence).
        // What MUST NOT happen: the appended events get silently overwritten.
        const concurrentEvents = Array.from({ length: 5 }, (_, i) => JSON.stringify({ post: i }));
        const ops = [
          store!.storeCurrentSequence(sessionId),
          ...concurrentEvents.map((e) => store!.addEventToCurrentSequence(sessionId, e)),
        ];
        await Promise.all(ops);

        // Sum events across both stores.
        const sequencesToSend = (await store!.getSequencesToSend()) ?? [];
        const currentSequence = (await store!.getCurrentSequenceEvents(sessionId)) ?? [];
        const total =
          sequencesToSend.reduce((acc, s) => acc + s.events.length, 0) +
          currentSequence.reduce((acc, s) => acc + s.events.length, 0);

        // 2 (pre) + 5 (post) = 7 events should be present total — none dropped.
        expect(total).toBe(7);
      } finally {
        restore();
      }
    });

    test('storeCurrentSequence is a no-op when the slot is owned by another tab', async () => {
      // Without the fix, storeCurrentSequence would happily promote another tab's
      // events under THIS tab's tabId, hijacking them.  The fix adds an ownership
      // check that skips foreign-tab records.
      const { restore } = useSharedIDBFactory();
      try {
        const tabA = await SessionReplayEventsIDBStore.new('replay', {
          apiKey,
          loggerProvider: makeLogger(),
          tabId: 'tab-a',
        });
        const tabB = await SessionReplayEventsIDBStore.new('replay', {
          apiKey,
          loggerProvider: makeLogger(),
          tabId: 'tab-b',
        });

        const sessionId = 4242;

        // Tab B writes events; Tab A then calls storeCurrentSequence on the same
        // session.  Tab A must NOT promote Tab B's events under its own tabId.
        const b1 = JSON.stringify({ src: 'b', n: 1 });
        const b2 = JSON.stringify({ src: 'b', n: 2 });
        await tabB!.addEventToCurrentSequence(sessionId, b1);
        await tabB!.addEventToCurrentSequence(sessionId, b2);

        const result = await tabA!.storeCurrentSequence(sessionId);
        expect(result).toBeUndefined();

        // Tab B still owns the current sequence with both events — Tab A did not
        // overwrite it.
        const tabBCurrent = await tabB!.getCurrentSequenceEvents(sessionId);
        expect(tabBCurrent).toEqual([{ events: [b1, b2], sessionId }]);

        // Tab A's view of sequencesToSend should be empty — it did not steal.
        expect(await tabA!.getSequencesToSend()).toEqual([]);
      } finally {
        restore();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Default consecutiveFailureThreshold lowered to 1 (eager fallback to memory)
  // ---------------------------------------------------------------------------
  describe('default consecutiveFailureThreshold', () => {
    test('first IDB failure triggers onPersistentFailure (default threshold = 1)', async () => {
      // Sabotage the DB so every operation fails.
      const mockDB = {
        get: jest.fn().mockImplementation(() => Promise.reject(new Error('boom'))),
        put: jest.fn().mockImplementation(() => Promise.reject(new Error('boom'))),
        delete: jest.fn().mockImplementation(() => Promise.reject(new Error('boom'))),
        transaction: jest.fn().mockImplementation(() => {
          throw new Error('boom');
        }),
      } as unknown as import('idb').IDBPDatabase<EventsIDBStore.SessionReplayDB>;
      jest.spyOn(EventsIDBStore, 'createStore').mockResolvedValue(mockDB);

      const onPersistentFailure = jest.fn();
      const store = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: makeLogger(),
        onPersistentFailure,
        // NO consecutiveFailureThreshold — must default to 1.
      });

      expect(store).toBeDefined();

      // Single failure should trigger fallback immediately.
      await store!.getSequencesToSend();
      expect(onPersistentFailure).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge: sessionStorage unavailable falls back to a fresh randomUUID
  // ---------------------------------------------------------------------------
  describe('sessionStorage unavailable', () => {
    test('tabId falls back to crypto.randomUUID when sessionStorage throws', async () => {
      // Sabotage sessionStorage.getItem so the try/catch in tabId resolution falls
      // through to the catch branch and uses a fresh randomUUID instead.  Verify
      // the store still constructs successfully and operates normally.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const origGetItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function () {
        throw new Error('sessionStorage unavailable (e.g. SecurityError in cross-origin iframe)');
      };
      try {
        const store = await SessionReplayEventsIDBStore.new('replay', {
          apiKey,
          loggerProvider: makeLogger(),
        });
        expect(store).toBeDefined();
        // Confirm normal operation: writes and reads succeed.
        await store!.addEventToCurrentSequence(99, mockEvent);
        const currentSequence = await store!.getCurrentSequenceEvents(99);
        expect(currentSequence).toEqual([{ events: [mockEvent], sessionId: 99 }]);
      } finally {
        Storage.prototype.getItem = origGetItem;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // tx.done.catch in storeCurrentSequence — abort routes through recordFailure
  // ---------------------------------------------------------------------------
  describe('storeCurrentSequence tx.done.catch', () => {
    test('AbortError from storeCurrentSequence tx.done.catch triggers onPersistentFailure', async () => {
      // Outer try succeeds (puts/get resolve), but tx.done rejects after — the
      // tx.done.catch handler must call recordFailure() so the threshold mechanism
      // still trips fallback (mirroring the same fix verified for addEventToCurrentSequence
      // and getSequencesToSend in BUG 2 above).
      const abortError = new DOMException(
        'The transaction was aborted, so the request cannot be fulfilled.',
        'AbortError',
      );

      let rejectTxDone!: (e: unknown) => void;
      const txDone = new Promise<void>((_resolve, reject) => {
        rejectTxDone = reject;
      });
      txDone.catch(() => {
        // handled by the store's tx.done.catch
      });

      const mockDB = {
        transaction: jest.fn().mockReturnValue({
          objectStore: jest.fn().mockReturnValue({
            // Return a record so storeCurrentSequence proceeds to the put path.
            get: jest.fn().mockResolvedValue({ sessionId: 1, events: [mockEvent], tabId: 'tab-only' }),
            put: jest.fn().mockImplementation(() => {
              // Trigger abort *after* the put resolves so outer try succeeds.
              void Promise.resolve().then(() => rejectTxDone(abortError));
              return Promise.resolve(1); // sequenceId
            }),
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
        tabId: 'tab-only',
      });

      expect(store).toBeDefined();

      await store!.storeCurrentSequence(1);

      // Drain the microtask queue so tx.done.catch fires.
      await Promise.resolve();
      await Promise.resolve();

      expect(onPersistentFailure).toHaveBeenCalledTimes(1);
    });
  });
});
