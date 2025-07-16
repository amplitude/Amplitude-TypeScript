/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/unbound-method */
import { ILogger } from '@amplitude/analytics-core';
import { IDBPDatabase, openDB } from 'idb';
import * as EventsIDBStore from '../src/events/events-idb-store';
import * as AnalyticsCore from '@amplitude/analytics-core';
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

    test('should return undefined if storeSendingEvents fails', async () => {
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      // Fake as if there are events to send
      eventsStorage!.shouldSplitEventsList = jest.fn().mockReturnValue(true);
      eventsStorage!.storeSendingEvents = jest.fn().mockResolvedValue(undefined);

      await eventsStorage?.addEventToCurrentSequence(123, mockEventString);

      const eventsToSend = await eventsStorage?.addEventToCurrentSequence(123, mockEventString2);
      expect(eventsToSend).toBeUndefined();
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

  describe('transitionFromKeyValStore', () => {
    const mockKeyValStore = {
      123: {
        currentSequenceId: 3,
        sessionSequences: {
          1: {
            events: [],
            status: 'sent',
          },
          2: {
            events: [mockEventString],
            status: 'recording',
          },
          3: {
            events: [mockEventString, mockEventString2],
            status: 'recording',
          },
        },
      },
      456: {
        currentSequenceId: 6,
        sessionSequences: {
          4: {
            events: [mockEventString],
            status: 'recording',
          },
          5: {
            events: [],
            status: 'sent',
          },
          6: {
            events: [mockEventString, mockEventString2],
            status: 'recording',
          },
        },
      },
    };
    async function createKeyValDB() {
      return await openDB('keyval-store', 1, {
        upgrade: (db) => {
          if (!db.objectStoreNames.contains('keyval')) {
            db.createObjectStore('keyval');
          }
        },
      });
    }
    test('should return early if no keyval database exists', async () => {
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      jest.spyOn(EventsIDBStore, 'keyValDatabaseExists').mockResolvedValueOnce(undefined);
      jest.spyOn(global.indexedDB, 'deleteDatabase');

      await eventsStorage?.transitionFromKeyValStore();
      expect(global.indexedDB.deleteDatabase).not.toHaveBeenCalled();
    });

    test('should warn user if keyval database cannot be accessed', async () => {
      const mockGlobalScope = {
        indexedDB: {
          open: jest.fn().mockImplementation(() => {
            throw new Error('Test error');
          }),
        },
      } as unknown as typeof globalThis;
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(mockGlobalScope);

      await eventsStorage?.transitionFromKeyValStore();
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });

    test('should reject when global scope is undefined', async () => {
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(undefined);

      await expect(EventsIDBStore.keyValDatabaseExists()).rejects.toThrow('Global scope not found');
    });

    test('should reject when indexedDB does not exist', async () => {
      const mockGlobalScope = {} as Omit<typeof globalThis, 'indexedDB'>;
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(mockGlobalScope as typeof globalThis);

      await expect(EventsIDBStore.keyValDatabaseExists()).rejects.toThrow('Session Replay: cannot find indexedDB');
    });

    test('should reject when indexedDB.open throws an error', async () => {
      const mockGlobalScope = {
        indexedDB: {
          open: jest.fn().mockImplementation(() => {
            throw new Error('Test error');
          }),
        },
      } as unknown as typeof globalThis;

      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(mockGlobalScope);

      await expect(EventsIDBStore.keyValDatabaseExists()).rejects.toThrow('Test error');
    });

    test('should reject when indexedDB.open request errors', async () => {
      const request = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        result: {} as IDBDatabase,
        error: new Error('Open error'),
      } as unknown as IDBOpenDBRequest;

      const mockGlobalScope = {
        indexedDB: {
          open: jest.fn().mockReturnValue(request),
        },
      } as unknown as typeof globalThis;

      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(mockGlobalScope);

      const promise = EventsIDBStore.keyValDatabaseExists();
      request.onerror?.call(request, new Event('error'));

      await expect(promise).rejects.toBe(request.error);
    });

    test('should add current session events to new idb sessionCurrentSequence', async () => {
      const db = await createKeyValDB();
      await db.put('keyval', mockKeyValStore, 'AMP_unsent_static_key');
      const eventsStorage = await SessionReplayEventsIDBStore.new(
        'replay',
        {
          apiKey,
          loggerProvider: mockLoggerProvider,
        },
        123,
      );
      const sessionCurrentSequence = await eventsStorage?.getCurrentSequenceEvents(123);
      expect(sessionCurrentSequence).toEqual([{ events: [mockEventString, mockEventString2], sessionId: 123 }]);
    });

    test('should add unsent old session events to sequencesToSend', async () => {
      const db = await createKeyValDB();
      await db.put('keyval', mockKeyValStore, 'AMP_unsent_static_key');
      const eventsStorage = await SessionReplayEventsIDBStore.new(
        'replay',
        {
          apiKey,
          loggerProvider: mockLoggerProvider,
        },
        123,
      );

      const sequencesToSend = await eventsStorage?.getSequencesToSend();
      expect(sequencesToSend).toEqual([
        {
          events: [mockEventString],
          sequenceId: 1,
          sessionId: 123,
        },
        {
          events: [mockEventString],
          sequenceId: 2,
          sessionId: 456,
        },
        {
          events: [mockEventString, mockEventString2],
          sequenceId: 3,
          sessionId: 456,
        },
      ]);
    });

    test('should only operate on current api key store', async () => {
      const db = await createKeyValDB();
      await db.put('keyval', mockKeyValStore, 'AMP_unsent_static_key');
      //  Fill out a store for another api key to ensure we are grabbing the right events
      await db.put(
        'keyval',
        {
          789: {
            currentSequenceId: 11,
            sessionSequences: {
              11: {
                events: [],
                status: 'sent',
              },
            },
          },
        },
        'AMP_unsent_other_api_key',
      );
      const eventsStorage = await SessionReplayEventsIDBStore.new(
        'replay',
        {
          apiKey,
          loggerProvider: mockLoggerProvider,
        },
        123,
      );

      const sequencesToSend = await eventsStorage?.getSequencesToSend();
      expect(sequencesToSend).toEqual([
        {
          events: [mockEventString],
          sequenceId: 1,
          sessionId: 123,
        },
        {
          events: [mockEventString],
          sequenceId: 2,
          sessionId: 456,
        },
        {
          events: [mockEventString, mockEventString2],
          sequenceId: 3,
          sessionId: 456,
        },
      ]);
    });
    test('should catch errors', async () => {
      const db = await createKeyValDB();
      await db.put('keyval', mockKeyValStore, 'AMP_unsent_static_key');
      jest.spyOn(EventsIDBStore, 'keyValDatabaseExists').mockResolvedValue({
        transaction: jest.fn().mockImplementation(() => {
          throw new Error('error');
        }),
      } as unknown as IDBDatabase);
      await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });

    test('should delete keyval database', async () => {
      const eventsStorage = await SessionReplayEventsIDBStore.new('replay', {
        apiKey,
        loggerProvider: mockLoggerProvider,
      });

      await createKeyValDB();
      jest.spyOn(global.indexedDB, 'deleteDatabase');
      await eventsStorage?.transitionFromKeyValStore();
      expect(global.indexedDB.deleteDatabase).toHaveBeenCalledWith('keyval-store');
    });
  });
});
