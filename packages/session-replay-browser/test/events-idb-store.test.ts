/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/unbound-method */
import { ILogger } from '@amplitude/analytics-core';
import { IDBPDatabase } from 'idb';
import * as EventsIDBStore from '../src/events/events-idb-store';
import { SessionReplayDB, SessionReplayEventsIDBStore } from '../src/events/events-idb-store';

type MockedLogger = jest.Mocked<ILogger>;

const apiKey = 'static_key';
const mockEvent = {
  type: 4,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};
const mockEvent2 = {
  type: 2,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};
const mockEventString = JSON.stringify(mockEvent);
const mockEventString2 = JSON.stringify(mockEvent2);

function mockStoreForError() {
  const mockDB: IDBPDatabase<SessionReplayDB> = {
    get: jest.fn().mockImplementation(() => Promise.reject('get error')),
    put: jest.fn().mockImplementation(() => Promise.reject('put error')),
    delete: jest.fn().mockImplementation(() => Promise.reject('put error')),
  } as unknown as IDBPDatabase<SessionReplayDB>;
  jest.spyOn(EventsIDBStore, 'createStore').mockResolvedValue(mockDB);
  return mockDB;
}

describe('SessionReplayEventsIDBStore', () => {
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  describe('new', () => {
    test('returns undefined on error', async () => {
      jest.spyOn(EventsIDBStore, 'createStore').mockRejectedValue(new Error('Failed to create store'));

      expect(
        await SessionReplayEventsIDBStore.new('replay', { apiKey, loggerProvider: mockLoggerProvider }),
      ).toBeUndefined();
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        'Failed to store session replay events in IndexedDB: Error: Failed to create store',
      );
    });
  });

  describe('getSequencesToSend', () => {
    test('should fetch all sequences that have not yet been sent to the backend', async () => {
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });
      await eventsStorage?.storeSendingEvents(123, [mockEventString]);
      await eventsStorage?.storeSendingEvents(456, [mockEventString]);
      await eventsStorage?.storeSendingEvents(456, [mockEventString, mockEventString]);
      const unsentSequences = await eventsStorage?.getSequencesToSend();
      expect(unsentSequences).toEqual([
        {
          sessionId: 123,
          sequenceId: 1,
          events: [mockEventString],
        },
        {
          sessionId: 456,
          sequenceId: 2,
          events: [mockEventString],
        },
        {
          sessionId: 456,
          sequenceId: 3,
          events: [mockEventString, mockEventString],
        },
      ]);
    });
    // SR-4284: IDB drain on init can encounter sequencesToSend rows with events:[]
    // that older SDK builds persisted (e.g. via the addEventToCurrentSequence
    // split-with-empty-buffer path before the SR-4284 fix). Those rows must be
    // filtered out so the network layer never POSTs an empty body.
    test('filters out and deletes empty sequences (stale records persisted by older SDK builds)', async () => {
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });
      await eventsStorage?.storeSendingEvents(123, []);
      await eventsStorage?.storeSendingEvents(456, [mockEventString]);
      await eventsStorage?.storeSendingEvents(789, []);

      const unsentSequences = await eventsStorage?.getSequencesToSend();
      expect(unsentSequences).toEqual([{ sessionId: 456, sequenceId: 2, events: [mockEventString] }]);
      // Sampled warn (1-of-100, first hit deterministic) should fire when filter triggers.
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        expect.stringContaining('Filtered empty session replay sequence'),
      );

      // The empty rows should have been pruned in-place — a second call must
      // see them gone and not re-fire the sampled warn (otherwise older-SDK
      // residue produces Datadog noise indefinitely across page reloads).
      (mockLoggerProvider.warn as jest.Mock).mockClear();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawDb = (eventsStorage as any).db as IDBPDatabase<SessionReplayDB>;
      const allRows = await rawDb.getAll('sequencesToSend');
      expect(allRows).toHaveLength(1);
      expect(allRows[0].events).toEqual([mockEventString]);

      const second = await eventsStorage?.getSequencesToSend();
      expect(second).toEqual([{ sessionId: 456, sequenceId: 2, events: [mockEventString] }]);
      expect(mockLoggerProvider.warn).not.toHaveBeenCalled();
    });
    test('should handle undefined store', async () => {
      mockStoreForError();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      const unsentSequences = await eventsStorage?.getSequencesToSend();
      expect(unsentSequences).toBeUndefined();
    });

    test('should catch errors', async () => {
      mockStoreForError();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      const unsentSequences = await eventsStorage?.getSequencesToSend();
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
      expect(unsentSequences).toBeUndefined();
    });

    test('should log at debug (not warn) when tx.done rejects with AbortError', async () => {
      // Repro: transaction aborts after cursor exhaustion; tx.done rejection must be caught
      const abortError = new DOMException(
        'The transaction was aborted, so the request cannot be fulfilled.',
        'AbortError',
      );
      const txDone = Promise.reject(abortError);
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      txDone.catch(() => {}); // prevent unhandled rejection in test runner
      const mockDB = {
        transaction: jest.fn().mockReturnValue({
          store: { openCursor: jest.fn().mockResolvedValue(null) },
          done: txDone,
        }),
      } as unknown as IDBPDatabase<SessionReplayDB>;
      jest.spyOn(EventsIDBStore, 'createStore').mockResolvedValue(mockDB);

      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      const result = await eventsStorage?.getSequencesToSend();
      // With the .catch() approach the function returns whatever sequences were
      // collected before the abort (an empty array here since the cursor was null).
      expect(result).toEqual([]);
      expect(mockLoggerProvider.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to store session replay events in IndexedDB'),
      );
      expect(mockLoggerProvider.warn).not.toHaveBeenCalled();
    });
  });

  describe('storeCurrentSequence', () => {
    test('should get the current sequence, store it in sequences to send, and return current sequence with an id', async () => {
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });
      // Put data in for two different sessions to represent a more realistic scenario
      await eventsStorage?.addEventToCurrentSequence(123, mockEventString);
      await eventsStorage?.addEventToCurrentSequence(123, mockEventString);

      await eventsStorage?.addEventToCurrentSequence(456, mockEventString);
      await eventsStorage?.addEventToCurrentSequence(456, mockEventString);

      const sequenceData = await eventsStorage?.storeCurrentSequence(123);

      expect(sequenceData).toEqual({
        sessionId: 123,
        sequenceId: 1,
        events: [mockEventString, mockEventString],
      });
    });
    test('should return undefined if there is no current sequence data', async () => {
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      const sequenceData = await eventsStorage?.storeCurrentSequence(123);

      expect(sequenceData).toBeUndefined();
    });
    // SR-4284: a current-sequence record with events:[] should NOT be promoted to
    // sequencesToSend (would POST as an empty body and 400 on the server).
    test('returns undefined when current-sequence record exists with zero events', async () => {
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      // Seed a session row, then split it so the current-sequence slot is reset
      // to events:[] but still owned by this tab.
      eventsStorage!.shouldSplitEventsList = jest.fn().mockReturnValue(false);
      await eventsStorage?.addEventToCurrentSequence(123, mockEventString);
      await eventsStorage?.storeCurrentSequence(123);
      // After storeCurrentSequence the current-sequence slot for 123 is { events: [], tabId }.

      const sequenceData = await eventsStorage?.storeCurrentSequence(123);
      expect(sequenceData).toBeUndefined();
      // Sampled warn (1-of-100, deterministic on first hit) should have fired.
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        expect.stringContaining('Filtered empty session replay sequence'),
      );
    });
    test('should catch errors', async () => {
      mockStoreForError();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      const sequenceData = await eventsStorage?.storeCurrentSequence(123);
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
      expect(sequenceData).toBeUndefined();
    });
    test('should handle undefined store', async () => {
      mockStoreForError();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      const sequenceData = await eventsStorage?.storeCurrentSequence(123);
      expect(sequenceData).toBeUndefined();
    });
  });

  describe('addEventToCurrentSequence', () => {
    test('should create a new list if there are no existing sequence events', async () => {
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      const eventsToSend = await eventsStorage?.addEventToCurrentSequence(123, mockEventString);
      expect(eventsToSend).toBeUndefined();
      const allSessionCurrentSequence = await eventsStorage?.getCurrentSequenceEvents(123);
      expect(allSessionCurrentSequence).toEqual([{ events: [mockEventString], sessionId: 123 }]);
    });
    test('should add event to list if there is an existing list', async () => {
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      await eventsStorage?.addEventToCurrentSequence(123, mockEventString);
      await eventsStorage?.addEventToCurrentSequence(456, mockEventString);
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());

      const eventsToSend = await eventsStorage?.addEventToCurrentSequence(123, mockEventString);
      expect(eventsToSend).toBeUndefined();
      const allSessionCurrentSequence = await eventsStorage?.getCurrentSequenceEvents();
      expect(allSessionCurrentSequence).toEqual([
        { events: [mockEventString, mockEventString], sessionId: 123 },
        { events: [mockEventString], sessionId: 456 },
      ]);
    });

    test('should split the events list at an increasing interval and send', async () => {
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });
      eventsStorage!.shouldSplitEventsList = jest.fn().mockReturnValue(true);

      await eventsStorage?.addEventToCurrentSequence(123, mockEventString);

      const eventsToSend = await eventsStorage?.addEventToCurrentSequence(123, mockEventString2);
      expect(eventsToSend).toEqual({ sessionId: 123, events: [mockEventString], sequenceId: 1 });
      const allSessionCurrentSequence = await eventsStorage?.getCurrentSequenceEvents(123);
      expect(allSessionCurrentSequence).toEqual([{ events: [mockEventString2], sessionId: 123 }]);
    });

    // SR-4284: shouldSplitEventsList can return true with an empty buffer when a
    // single incoming event is larger than MAX_EVENT_LIST_SIZE (700 KB) — the size
    // branch fires regardless of current length. The split path must NOT write a
    // zero-event row to sequencesToSend; just claim the slot for the incoming event.
    test('does not write empty sequencesToSend row when split fires on empty buffer', async () => {
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });
      // Set up the precondition: an existing current-sequence row owned by this tab
      // with events:[]. addEventToCurrentSequence's first-time path (no record) won't
      // exercise the split branch — we need an existing empty slot.
      eventsStorage!.shouldSplitEventsList = jest.fn().mockReturnValue(false);
      await eventsStorage?.addEventToCurrentSequence(123, mockEventString);
      await eventsStorage?.storeCurrentSequence(123);
      // Slot is now { events: [], tabId } and sequencesToSend has 1 row (sequenceId=1).

      // Now flip shouldSplit to true and add a new event — the split path will run
      // with eventsToSend=[]. Without the SR-4284 fix this writes an empty row.
      eventsStorage!.shouldSplitEventsList = jest.fn().mockReturnValue(true);
      const result = await eventsStorage?.addEventToCurrentSequence(123, mockEventString2);

      // No completed sequence returned (nothing was finalized).
      expect(result).toBeUndefined();
      // The incoming event is held in the current-sequence slot for next time.
      const allSessionCurrentSequence = await eventsStorage?.getCurrentSequenceEvents(123);
      expect(allSessionCurrentSequence).toEqual([{ events: [mockEventString2], sessionId: 123 }]);
      // Inspect raw DB directly — the getSequencesToSend filter would mask a buggy
      // empty write, so we open a cursor and count rows ourselves.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawDb = (eventsStorage as any).db as IDBPDatabase<SessionReplayDB>;
      const allRows = await rawDb.getAll('sequencesToSend');
      expect(allRows).toHaveLength(1);
      expect(allRows[0].events).toEqual([mockEventString]);
      // Sampled warn fires at the root-cause filter site so post-deploy Datadog can
      // confirm the new SDK is preventing the bug at its source.
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        expect.stringContaining('Filtered empty session replay sequence at addEventToCurrentSequence'),
      );
    });

    test('should split the events list at max size and send', async () => {
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
        maxPersistedEventsSize: 20,
      });

      // Simulate as if many events have already been built up
      const events = ['#'.repeat(20)];
      await Promise.all(
        events.map((event) => {
          return eventsStorage?.addEventToCurrentSequence(123, event);
        }),
      );

      const eventsToSend = await eventsStorage?.addEventToCurrentSequence(123, mockEventString2);
      expect(eventsToSend).toEqual({ sessionId: 123, events: events, sequenceId: 1 });
      const allSessionCurrentSequence = await eventsStorage?.getCurrentSequenceEvents(123);
      expect(allSessionCurrentSequence).toEqual([{ events: [mockEventString2], sessionId: 123 }]);
    });

    test('should return undefined if the split-path transaction fails', async () => {
      // The split path now uses a single multi-store transaction for both
      // sessionCurrentSequence and sequencesToSend. Verify that a transaction
      // error still results in undefined being returned and a warn being logged.
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      eventsStorage!.shouldSplitEventsList = jest.fn().mockReturnValue(true);

      // Seed one event so shouldSplitEventsList can trigger on the next call
      await eventsStorage?.addEventToCurrentSequence(123, mockEventString);

      // Sabotage the db so the next transaction() call throws
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (eventsStorage as any).db = {
        transaction: () => {
          throw new Error('transaction failed');
        },
      };

      const eventsToSend = await eventsStorage?.addEventToCurrentSequence(123, mockEventString2);
      expect(eventsToSend).toBeUndefined();
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });

    test('should catch errors', async () => {
      mockStoreForError();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      const eventsToSend = await eventsStorage?.addEventToCurrentSequence(123, mockEventString2);
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
      expect(eventsToSend).toBeUndefined();
    });

    test('should log at debug (not warn) when tx.done rejects with AbortError on first event for session', async () => {
      // Repro: tx.done rejects with AbortError after put succeeds (transaction aborts before commit).
      // The old code had an early `return` before `await tx.done` in the !sequenceEvents branch,
      // meaning this rejection was silently unhandled instead of being routed through logIdbError.
      const abortError = new DOMException(
        'The transaction was aborted, so the request cannot be fulfilled.',
        'AbortError',
      );
      const txDone = Promise.reject(abortError);
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      txDone.catch(() => {}); // prevent unhandled rejection in test runner
      const mockDB = {
        transaction: jest.fn().mockReturnValue({
          objectStore: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(undefined), // no existing sequence
            put: jest.fn().mockResolvedValue(undefined), // put succeeds
          }),
          done: txDone, // but transaction aborts before commit
        }),
      } as unknown as IDBPDatabase<SessionReplayDB>;
      jest.spyOn(EventsIDBStore, 'createStore').mockResolvedValue(mockDB);

      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      const result = await eventsStorage?.addEventToCurrentSequence(123, mockEventString);
      expect(result).toBeUndefined();
      expect(mockLoggerProvider.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to store session replay events in IndexedDB'),
      );
      expect(mockLoggerProvider.warn).not.toHaveBeenCalled();
    });
    test('should log at debug (not warn) when tx.done rejects with AbortError on split path', async () => {
      // Repro: the transaction opens both stores atomically. If the browser aborts the
      // transaction after the puts succeed (e.g. due to resource pressure), the AbortError
      // from tx.done must be caught and logged at debug, not warn.
      const abortError = new DOMException(
        'The transaction was aborted, so the request cannot be fulfilled.',
        'AbortError',
      );
      const txDoneForSplit = Promise.reject(abortError);
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      txDoneForSplit.catch(() => {}); // prevent unhandled rejection in test runner

      const mockDB = {
        transaction: jest.fn().mockReturnValue({
          // objectStore() returns the same mock regardless of store name
          objectStore: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({ sessionId: 123, events: [mockEventString] }),
            put: jest.fn().mockResolvedValue(1),
          }),
          done: txDoneForSplit, // tx aborts before commit
        }),
      } as unknown as IDBPDatabase<SessionReplayDB>;
      jest.spyOn(EventsIDBStore, 'createStore').mockResolvedValue(mockDB);

      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });
      eventsStorage!.shouldSplitEventsList = jest.fn().mockReturnValue(true);

      await eventsStorage?.addEventToCurrentSequence(123, mockEventString2);
      // Allow microtasks to settle so the tx.done.catch() handler fires
      await Promise.resolve();
      expect(mockLoggerProvider.debug).toHaveBeenCalledWith(
        expect.stringContaining('Failed to store session replay events in IndexedDB'),
      );
      expect(mockLoggerProvider.warn).not.toHaveBeenCalled();
    });
    test('should handle undefined store', async () => {
      mockStoreForError();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      const eventsToSend = await eventsStorage?.addEventToCurrentSequence(123, mockEventString2);
      expect(eventsToSend).toBeUndefined();
    });
  });

  describe('storeSendingEvents', () => {
    test('should store events and return a sequence id', async () => {
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      const sequenceId = await eventsStorage?.storeSendingEvents(123, [mockEventString]);

      expect(sequenceId).toBe(1);
      const allSequencesToSend = await eventsStorage?.getSequencesToSend();
      expect(allSequencesToSend).toEqual([{ events: [mockEventString], sessionId: 123, sequenceId: 1 }]);
    });
    test('should catch errors', async () => {
      mockStoreForError();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      const sequenceId = await eventsStorage?.storeSendingEvents(123, [mockEventString]);
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
      expect(sequenceId).toBeUndefined();
    });
    test('should handle undefined store', async () => {
      mockStoreForError();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      const sequenceId = await eventsStorage?.storeSendingEvents(123, [mockEventString]);
      expect(sequenceId).toBeUndefined();
    });
  });

  describe('cleanUpSessionEventsStore', () => {
    test('should delete sequence to send', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      const currentSessionId = new Date('2023-07-31 07:30:00').getTime();
      const nextSessionId = new Date('2023-07-31 08:30:00').getTime();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      await eventsStorage?.storeSendingEvents(currentSessionId, [mockEventString]);
      await eventsStorage?.storeSendingEvents(nextSessionId, [mockEventString2]);

      await eventsStorage?.cleanUpSessionEventsStore(0, 1);

      const allSequencesToSend = await eventsStorage?.getSequencesToSend();
      expect(allSequencesToSend).toEqual([{ events: [mockEventString2], sessionId: nextSessionId, sequenceId: 2 }]);
    });
    test('should do nothing for no sequence id', async () => {
      const db = mockStoreForError();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      await eventsStorage?.cleanUpSessionEventsStore(0);
      expect(db.delete).not.toHaveBeenCalled();
    });
    test('should catch errors', async () => {
      mockStoreForError();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      await eventsStorage?.cleanUpSessionEventsStore(0, 1);
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });
  });

  describe('persistent failure tracking', () => {
    test('calls onPersistentFailure after consecutive failures reach threshold', async () => {
      mockStoreForError();
      const onPersistentFailure = jest.fn();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
        onPersistentFailure,
        consecutiveFailureThreshold: 2,
      });

      await eventsStorage?.getSequencesToSend(); // failure 1
      expect(onPersistentFailure).not.toHaveBeenCalled();
      await eventsStorage?.getSequencesToSend(); // failure 2 — triggers callback
      expect(onPersistentFailure).toHaveBeenCalledTimes(1);
    });

    test('does not call onPersistentFailure before threshold is reached', async () => {
      mockStoreForError();
      const onPersistentFailure = jest.fn();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
        onPersistentFailure,
        consecutiveFailureThreshold: 3,
      });

      await eventsStorage?.getSequencesToSend(); // failure 1
      await eventsStorage?.getSequencesToSend(); // failure 2
      expect(onPersistentFailure).not.toHaveBeenCalled();
    });

    test('calls onPersistentFailure only once regardless of further failures', async () => {
      mockStoreForError();
      const onPersistentFailure = jest.fn();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
        onPersistentFailure,
        consecutiveFailureThreshold: 1,
      });

      await eventsStorage?.getSequencesToSend();
      await eventsStorage?.getSequencesToSend();
      await eventsStorage?.getSequencesToSend();
      expect(onPersistentFailure).toHaveBeenCalledTimes(1);
    });

    test('does not throw when threshold is reached with no callback registered', async () => {
      mockStoreForError();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
        consecutiveFailureThreshold: 1,
        // no onPersistentFailure
      });

      await expect(eventsStorage?.getSequencesToSend()).resolves.toBeUndefined();
    });

    test('resets consecutive failure count on successful operation', async () => {
      const mockDB = mockStoreForError();
      const onPersistentFailure = jest.fn();
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
        onPersistentFailure,
        consecutiveFailureThreshold: 2,
      });

      await eventsStorage?.storeSendingEvents(123, [mockEventString]); // failure 1
      expect(onPersistentFailure).not.toHaveBeenCalled();

      // Make next put succeed so recordSuccess() resets the counter
      (mockDB.put as jest.Mock).mockResolvedValueOnce(1);
      await eventsStorage?.storeSendingEvents(123, [mockEventString]); // success — resets counter

      // One more failure — counter is back to 1, threshold is 2, no callback yet
      await eventsStorage?.storeSendingEvents(123, [mockEventString]); // failure 1 (fresh)
      expect(onPersistentFailure).not.toHaveBeenCalled();
    });
  });
});
