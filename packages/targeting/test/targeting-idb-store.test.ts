/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@amplitude/analytics-types';
import { IDBPDatabase } from 'idb';
import { TargetingDB, targetingIDBStore } from '../src/targeting-idb-store';

type MockedLogger = jest.Mocked<Logger>;

type EventTypesEntry = {
  eventTypes: Record<string, Record<number | string, { event_type: string }>>;
  sessionId: string;
  lastUpdated: number;
};

type StoreEventParams = {
  eventTime: number;
  eventType: string;
  sessionId: number | string;
  apiKey?: string;
  loggerProvider?: MockedLogger;
};

// Test constants
const TEST_API_KEY = 'static_key';
const TEST_EVENT_TIME = 123;
const TEST_SESSION_ID = 123;

// Helper function to create a fresh mock logger
const createMockLogger = (): MockedLogger => ({
  error: jest.fn(),
  log: jest.fn(),
  disable: jest.fn(),
  enable: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
});

// Helper function to get all entries from the database
async function getAllEntriesTyped(db: IDBPDatabase<TargetingDB>): Promise<EventTypesEntry[]> {
  const result = await db.getAll('eventTypesForSession');
  if (Array.isArray(result)) {
    return result.map((entry) => {
      // Defensive: only return if entry has the expected shape
      if (
        typeof entry === 'object' &&
        entry !== null &&
        'eventTypes' in entry &&
        'sessionId' in entry &&
        'lastUpdated' in entry
      ) {
        return entry as EventTypesEntry;
      }
      throw new Error('Unexpected entry shape in getAllEntriesTyped');
    });
  }
  return [];
}

// Helper function to store an event with default parameters
const storeEvent = async (params: Partial<StoreEventParams> = {}): Promise<MockedLogger> => {
  const logger = createMockLogger();
  await targetingIDBStore.storeEventTypeForSession({
    eventTime: params.eventTime ?? TEST_EVENT_TIME,
    eventType: params.eventType ?? 'Add to Cart',
    sessionId: params.sessionId ?? TEST_SESSION_ID,
    apiKey: params.apiKey ?? TEST_API_KEY,
    loggerProvider: params.loggerProvider ?? logger,
  });
  return logger;
};

// Helper function to create a mock database that throws errors
const createMockDBWithError = (errorType: 'transaction' | 'put' | 'getAll'): IDBPDatabase<TargetingDB> => {
  const mockStore = {
    put: jest.fn().mockImplementation(() => (errorType === 'put' ? Promise.reject('put error') : Promise.resolve())),
    getAll: jest
      .fn()
      .mockImplementation(() => (errorType === 'getAll' ? Promise.reject('getAll error') : Promise.resolve([]))),
  };

  const mockTransaction =
    errorType === 'transaction'
      ? undefined
      : {
          store: mockStore,
        };

  return {
    transaction: jest.fn().mockImplementation(() => mockTransaction),
  } as unknown as IDBPDatabase<TargetingDB>;
};

describe('targeting idb store', () => {
  let db: IDBPDatabase<TargetingDB>;
  let mockLogger: MockedLogger;
  let dateNowSpy: jest.SpyInstance<number, []>;

  beforeEach(async () => {
    // Create fresh mock logger for each test
    mockLogger = createMockLogger();

    // Open database and clear it
    db = await targetingIDBStore.openOrCreateDB(TEST_API_KEY);
    await db.clear('eventTypesForSession');

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up database
    if (db) {
      await db.clear('eventTypesForSession');
    }

    // Restore any mocked timers
    jest.useRealTimers();

    // Restore Date.now spy if it exists
    if (dateNowSpy) {
      dateNowSpy.mockRestore();
    }

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Close database connections
    if (db) {
      db.close();
    }
  });

  describe('storeEventTypeForSession', () => {
    test('should add event to stored event list', async () => {
      await storeEvent({ eventType: 'Add to Cart' });
      await storeEvent({ eventType: 'Purchase' });

      const allEntries = await getAllEntriesTyped(db);
      expect(allEntries).toHaveLength(1);
      expect(allEntries[0]).toMatchObject({
        eventTypes: {
          'Add to Cart': { [TEST_EVENT_TIME]: { event_type: 'Add to Cart' } },
          Purchase: { [TEST_EVENT_TIME]: { event_type: 'Purchase' } },
        },
        sessionId: String(TEST_SESSION_ID),
      });
      expect(typeof allEntries[0].lastUpdated).toBe('number');
    });

    test('should handle adding the same event twice correctly', async () => {
      await storeEvent({ eventType: 'Add to Cart' });
      await storeEvent({ eventType: 'Add to Cart' });

      const allEntries = await getAllEntriesTyped(db);
      expect(allEntries).toHaveLength(1);
      expect(allEntries[0]).toMatchObject({
        eventTypes: {
          'Add to Cart': { [TEST_EVENT_TIME]: { event_type: 'Add to Cart' } },
        },
        sessionId: String(TEST_SESSION_ID),
      });
      expect(typeof allEntries[0].lastUpdated).toBe('number');
    });

    test('should add the same event with different timestamps', async () => {
      await storeEvent({ eventType: 'Add to Cart', eventTime: 123 });
      await storeEvent({ eventType: 'Add to Cart', eventTime: 456 });

      const allEntries = await getAllEntriesTyped(db);
      expect(allEntries).toHaveLength(1);
      expect(allEntries[0]).toMatchObject({
        eventTypes: {
          'Add to Cart': {
            123: { event_type: 'Add to Cart' },
            456: { event_type: 'Add to Cart' },
          },
        },
        sessionId: String(TEST_SESSION_ID),
      });
      expect(typeof allEntries[0].lastUpdated).toBe('number');
    });

    test('should return updated list', async () => {
      await storeEvent({ eventType: 'Add to Cart' });

      const updatedList = await targetingIDBStore.storeEventTypeForSession({
        eventTime: TEST_EVENT_TIME,
        eventType: 'Purchase',
        sessionId: TEST_SESSION_ID,
        apiKey: TEST_API_KEY,
        loggerProvider: mockLogger,
      });

      expect(updatedList).toEqual({
        'Add to Cart': { [String(TEST_EVENT_TIME)]: { event_type: 'Add to Cart' } },
        Purchase: { [String(TEST_EVENT_TIME)]: { event_type: 'Purchase' } },
      });
    });

    test('should handle errors in updateEventListForSession', async () => {
      const updateSpy = jest
        .spyOn(targetingIDBStore, 'updateEventListForSession')
        .mockRejectedValueOnce(new Error('update error'));

      await storeEvent({ loggerProvider: mockLogger });

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to store events for targeting'));

      updateSpy.mockRestore();
    });

    test('should handle errors on updating event list', async () => {
      const mockDB = createMockDBWithError('put');
      const openDBSpy = jest.spyOn(targetingIDBStore, 'openOrCreateDB').mockResolvedValue(mockDB);

      await storeEvent({ loggerProvider: mockLogger });

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to store events for targeting'));

      openDBSpy.mockRestore();
    });

    test('should handle undefined transaction', async () => {
      const mockDB = createMockDBWithError('transaction');
      const openDBSpy = jest.spyOn(targetingIDBStore, 'openOrCreateDB').mockResolvedValue(mockDB);

      const updatedEventTypes = await targetingIDBStore.storeEventTypeForSession({
        eventTime: TEST_EVENT_TIME,
        eventType: 'Add to Cart',
        sessionId: TEST_SESSION_ID,
        apiKey: TEST_API_KEY,
        loggerProvider: mockLogger,
      });

      expect(updatedEventTypes).toBeUndefined();

      openDBSpy.mockRestore();
    });

    test('should delete old sessions', async () => {
      // Set up fake timers
      const oldSessionTime = new Date('2023-07-25 08:30:00').getTime();
      jest.useFakeTimers().setSystemTime(oldSessionTime);
      dateNowSpy = jest.spyOn(Date, 'now');

      // Create old session
      dateNowSpy.mockReturnValueOnce(oldSessionTime);
      const oldSessionId = oldSessionTime;
      await storeEvent({
        sessionId: oldSessionId,
        loggerProvider: mockLogger,
      });

      let allEntries = await getAllEntriesTyped(db);
      expect(allEntries).toHaveLength(1);
      expect(allEntries[0]).toMatchObject({
        eventTypes: { 'Add to Cart': { [TEST_EVENT_TIME]: { event_type: 'Add to Cart' } } },
        sessionId: String(oldSessionId),
      });
      expect(allEntries[0].lastUpdated).toBe(oldSessionTime);

      // Advance time by 6 days (more than 2 days)
      const newSessionTime = oldSessionTime + 1000 * 60 * 60 * 24 * 6;
      jest.setSystemTime(newSessionTime);
      dateNowSpy.mockReturnValueOnce(newSessionTime);

      const newSessionId = new Date('2023-07-31 07:30:00').getTime();
      await storeEvent({
        sessionId: newSessionId,
        loggerProvider: mockLogger,
      });

      allEntries = await getAllEntriesTyped(db);
      expect(allEntries).toHaveLength(1);
      expect(allEntries[0]).toMatchObject({
        eventTypes: { 'Add to Cart': { [TEST_EVENT_TIME]: { event_type: 'Add to Cart' } } },
        sessionId: String(newSessionId),
      });
      expect(allEntries[0].lastUpdated).toBe(newSessionTime);
    });

    test('should log error if deleteOldSessionEventTypes throws', async () => {
      const txUnknown: unknown = {
        store: {
          getAll: jest.fn().mockImplementation(() => {
            throw new Error('getAll error');
          }),
          delete: jest.fn(),
        },
      };
      const tx = txUnknown as Parameters<typeof targetingIDBStore.deleteOldSessionEventTypes>[0]['tx'];

      await targetingIDBStore.deleteOldSessionEventTypes({
        currentSessionId: '1',
        loggerProvider: mockLogger,
        tx,
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to clear old session event types for targeting:'),
      );
    });
  });
});
