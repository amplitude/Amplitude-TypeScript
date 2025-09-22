import 'fake-indexeddb/auto';
import { DiagnosticsStorage } from '../../src/diagnostics/diagnostics-storage';
import { ILogger } from '../../src/logger';
import { getGlobalScope } from '../../src/global-scope';

jest.mock('../../src/global-scope');

// Mock logger
const mockLogger: ILogger = {
  disable: jest.fn(),
  enable: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const apiKey = '1234567890abcdefg';

describe('DiagnosticsStorage', () => {
  let storage: DiagnosticsStorage;
  beforeEach(() => {
    jest.clearAllMocks();
    storage = new DiagnosticsStorage(apiKey, mockLogger);
    (getGlobalScope as jest.Mock).mockReturnValue(globalThis);
  });

  afterEach(() => {
    jest.resetAllMocks();
    (getGlobalScope as jest.Mock).mockRestore();
  });

  describe('constructor', () => {
    test('should initialize with apiKey and logger', () => {
      expect(storage.dbName).toBe('AMP_diagnostics_1234567890');
      expect(storage.logger).toBe(mockLogger);
    });
  });

  describe('isSupported', () => {
    test('should return true if IndexedDB is supported', () => {
      expect(DiagnosticsStorage.isSupported()).toBe(true);
    });
    test('should return false if IndexedDB is not supported', () => {
      (getGlobalScope as jest.Mock).mockReturnValue(undefined);
      expect(DiagnosticsStorage.isSupported()).toBe(false);
    });
  });

  describe('getDB', () => {
    test('should return the db', async () => {
      await expect(storage.getDB()).resolves.toBeDefined();
    });

    test('should call openDB if dbPromise is not set', async () => {
      storage.dbPromise = null;
      const mockDB = {} as IDBDatabase;
      const openDBSpy = jest.spyOn(storage, 'openDB').mockResolvedValue(mockDB);

      await expect(storage.getDB()).resolves.toBeDefined();
      expect(openDBSpy).toHaveBeenCalled();
    });
  });

  describe('openDB', () => {
    test('should reject on open DB request errors', async () => {
      // Mock indexedDB.open to simulate an error
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalOpen = indexedDB.open;
      const mockRequest = {
        onerror: null as ((event: Event) => void) | null,
        onsuccess: null as ((event: Event) => void) | null,
        onupgradeneeded: null as ((event: Event) => void) | null,
      };

      indexedDB.open = jest.fn().mockReturnValue(mockRequest);

      // Start the openDB operation
      const openDBPromise = storage.openDB();

      // Simulate the error event
      if (mockRequest.onerror) {
        mockRequest.onerror(new Event('error'));
      }

      // Verify the promise rejects with the correct error
      await expect(openDBPromise).rejects.toThrow('Failed to open IndexedDB');

      // Restore the original method
      indexedDB.open = originalOpen;
    });

    test('should handle database close event', async () => {
      // Mock indexedDB.open to simulate a successful open
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalOpen = indexedDB.open;
      const mockDB = {
        onclose: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        close: jest.fn(),
      };
      const mockRequest = {
        onerror: null as ((event: Event) => void) | null,
        onsuccess: null as ((event: Event) => void) | null,
        onupgradeneeded: null as ((event: Event) => void) | null,
        result: mockDB,
      };

      indexedDB.open = jest.fn().mockReturnValue(mockRequest);

      // Call getDB to trigger the openDB and set dbPromise
      const getDBPromise = storage.getDB();

      // Simulate the success event
      if (mockRequest.onsuccess) {
        mockRequest.onsuccess(new Event('success'));
      }

      // Wait for the promise to resolve
      const db = await getDBPromise;
      expect(db).toBe(mockDB);

      // Verify dbPromise is set
      expect(storage.dbPromise).toBeTruthy();

      // Simulate the database close event
      if (mockDB.onclose) {
        mockDB.onclose(new Event('close'));
      }

      // Verify that dbPromise is cleared when connection closes
      expect(storage.dbPromise).toBeNull();

      // Verify that the debug message was logged
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsStorage: DB connection closed.');

      // Restore the original method
      indexedDB.open = originalOpen;
    });

    test('should handle database error event', async () => {
      // Mock indexedDB.open to simulate a successful open
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const originalOpen = indexedDB.open;
      const mockDB = {
        onclose: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        close: jest.fn(),
      };
      const mockRequest = {
        onerror: null as ((event: Event) => void) | null,
        onsuccess: null as ((event: Event) => void) | null,
        onupgradeneeded: null as ((event: Event) => void) | null,
        result: mockDB,
      };

      indexedDB.open = jest.fn().mockReturnValue(mockRequest);

      // Call getDB to trigger the openDB and set dbPromise
      const getDBPromise = storage.getDB();

      // Simulate the success event
      if (mockRequest.onsuccess) {
        mockRequest.onsuccess(new Event('success'));
      }

      // Wait for the promise to resolve
      const db = await getDBPromise;
      expect(db).toBe(mockDB);

      // Simulate the database error event
      const errorEvent = new Event('error');
      if (mockDB.onerror) {
        mockDB.onerror(errorEvent);
      }

      // Verify that the error was logged
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsStorage: A global database error occurred.',
        errorEvent,
      );

      // Verify that db.close() was called
      expect(mockDB.close).toHaveBeenCalled();

      // Restore the original method
      indexedDB.open = originalOpen;
    });
  });

  describe('setTags', () => {
    test('should set tags', async () => {
      const testTags = { test: 'test', library: 'amplitude-typescript' };

      await expect(storage.setTags(testTags)).resolves.toBeUndefined();

      // Verify the tags were actually stored in IndexedDB by reading directly
      const dbName = `AMP_diagnostics_${apiKey.substring(0, 10)}`;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const transaction = db.transaction(['tags'], 'readonly');
      const store = transaction.objectStore('tags');

      const allRecords = await new Promise<any[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      expect(allRecords).toHaveLength(2);
      expect(allRecords).toEqual(
        expect.arrayContaining([
          { key: 'test', value: 'test' },
          { key: 'library', value: 'amplitude-typescript' },
        ]),
      );

      db.close();
    });

    test('should early return if tags is empty', async () => {
      const getDBSpy = jest.spyOn(storage, 'getDB');

      await expect(storage.setTags({})).resolves.toBeUndefined();

      expect(getDBSpy).not.toHaveBeenCalled();
      getDBSpy.mockRestore();
    });

    test('should handle put request errors', async () => {
      const testTags = { test: 'test' };

      // Create a mock put request that will automatically trigger error
      const mockPutRequest = {
        onerror: null as ((event: Event) => void) | null,
      };

      // Mock the store.put to return a request that will fail
      const mockStore = {
        put: jest.fn().mockImplementation(() => {
          // Simulate async error by triggering onerror after handlers are set
          setTimeout(() => {
            if (mockPutRequest.onerror) {
              const errorEvent = new Event('error');
              mockPutRequest.onerror(errorEvent);
            }
            // Also trigger transaction abort
            if (mockTransaction.onabort) {
              const abortEvent = new Event('abort');
              mockTransaction.onabort(abortEvent);
            }
          }, 0);
          return mockPutRequest;
        }),
      };

      // Mock the transaction that will abort due to put error
      const mockTransaction = {
        oncomplete: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        objectStore: jest.fn().mockReturnValue(mockStore),
      };

      // Mock the database
      const mockDB = {
        transaction: jest.fn().mockReturnValue(mockTransaction),
      };

      // Spy on getDB and make it return our mock database
      const getDBSpy = jest.spyOn(storage, 'getDB').mockResolvedValue(mockDB as unknown as IDBDatabase);

      // The setTags should handle the error gracefully
      await expect(storage.setTags(testTags)).resolves.toBeUndefined();

      // Give time for async error to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify the put request was attempted
      expect(mockStore.put).toHaveBeenCalledWith({ key: 'test', value: 'test' });

      // Verify both put error and transaction abort were logged
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsStorage: Failed to set tag',
        'test',
        'test',
        expect.any(Event),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsStorage: Failed to set tags', expect.any(Event));

      // Restore spy
      getDBSpy.mockRestore();
    });

    test('should handle error when openDB promise rejects', async () => {
      const testTags = { test: 'test' };
      const testError = new Error('Failed to open IndexedDB');
      const openDBSpy = jest.spyOn(storage, 'openDB').mockRejectedValue(testError);

      // The setTags should handle the error gracefully
      await expect(storage.setTags(testTags)).resolves.toBeUndefined();

      // Verify error was logged
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsStorage: Failed to set tags', testError);

      // Restore spy
      openDBSpy.mockRestore();
    });
  });

  describe('incrementCounters', () => {
    test('should increment counters', async () => {
      await expect(storage.incrementCounters({ clicks: 5, errors: 1 })).resolves.toBeUndefined();
    });

    test('should early return if counters is empty', async () => {
      await expect(storage.incrementCounters({})).resolves.toBeUndefined();
    });

    test('should handle put request errors', async () => {
      const testCounters = { clicks: 5 };

      // Create mock requests
      const mockGetRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        result: undefined, // No existing value
      };

      const mockPutRequest = {
        onerror: null as ((event: Event) => void) | null,
      };

      // Mock the store get and put methods (incrementCounters uses read-modify-write)
      const mockStore = {
        get: jest.fn().mockImplementation(() => {
          // Simulate successful get (no existing value)
          setTimeout(() => {
            if (mockGetRequest.onsuccess) {
              mockGetRequest.onsuccess(new Event('success'));
            }
          }, 0);
          return mockGetRequest;
        }),
        put: jest.fn().mockImplementation(() => {
          // Simulate async error by triggering onerror after handlers are set
          setTimeout(() => {
            if (mockPutRequest.onerror) {
              const errorEvent = new Event('error');
              mockPutRequest.onerror(errorEvent);
            }
            // Also trigger transaction abort
            if (mockTransaction.onabort) {
              const abortEvent = new Event('abort');
              mockTransaction.onabort(abortEvent);
            }
          }, 0);
          return mockPutRequest;
        }),
      };

      // Mock the transaction that will abort due to put error
      const mockTransaction = {
        oncomplete: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        objectStore: jest.fn().mockReturnValue(mockStore),
      };

      // Mock the database
      const mockDB = {
        transaction: jest.fn().mockReturnValue(mockTransaction),
      };

      // Spy on getDB and make it return our mock database
      const getDBSpy = jest.spyOn(storage, 'getDB').mockResolvedValue(mockDB as unknown as IDBDatabase);

      // The incrementCounters should handle the error gracefully
      await expect(storage.incrementCounters(testCounters)).resolves.toBeUndefined();

      // Give time for async error to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify the put request was attempted
      expect(mockStore.put).toHaveBeenCalledWith({ key: 'clicks', value: 5 });

      // Verify both get and put were called
      expect(mockStore.get).toHaveBeenCalledWith('clicks');
      expect(mockStore.put).toHaveBeenCalledWith({ key: 'clicks', value: 5 });

      // Verify both put error and transaction abort were logged
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsStorage: Failed to update counter',
        'clicks',
        expect.any(Event),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsStorage: Failed to increment counters',
        expect.any(Event),
      );

      // Restore spy
      getDBSpy.mockRestore();
    });

    test('should handle error when openDB promise rejects', async () => {
      const testCounters = { clicks: 5 };
      const testError = new Error('Failed to open IndexedDB');
      const openDBSpy = jest.spyOn(storage, 'openDB').mockRejectedValue(testError);

      // The incrementCounters should handle the error gracefully
      await expect(storage.incrementCounters(testCounters)).resolves.toBeUndefined();

      // Verify error was logged
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsStorage: Failed to increment counters', testError);

      // Restore spy
      openDBSpy.mockRestore();
    });

    test('should handle get request error when reading existing counter', async () => {
      const testCounters = { clicks: 5 };

      // Create mock requests
      const mockGetRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        result: undefined,
      };

      // Mock the transaction first so we can reference it
      const mockTransaction = {
        oncomplete: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        objectStore: jest.fn(),
      };

      // Mock the store get method to return a request that will fail
      const mockStore = {
        get: jest.fn().mockImplementation(() => {
          // Simulate async error by triggering onerror after handlers are set
          setTimeout(() => {
            if (mockGetRequest.onerror) {
              const errorEvent = new Event('error');
              mockGetRequest.onerror(errorEvent);
            }
            // Also trigger transaction complete to resolve the Promise
            if (mockTransaction.oncomplete) {
              mockTransaction.oncomplete(new Event('complete'));
            }
          }, 0);
          return mockGetRequest;
        }),
        put: jest.fn().mockReturnValue({ onerror: null }),
      };

      // Set up the mock store reference
      mockTransaction.objectStore.mockReturnValue(mockStore);

      // Mock the database
      const mockDB = {
        transaction: jest.fn().mockReturnValue(mockTransaction),
      };

      // Spy on getDB and make it return our mock database
      const getDBSpy = jest.spyOn(storage, 'getDB').mockResolvedValue(mockDB as unknown as IDBDatabase);

      // The incrementCounters should handle the error gracefully
      await expect(storage.incrementCounters(testCounters)).resolves.toBeUndefined();

      // Give time for async error to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify the get request was attempted
      expect(mockStore.get).toHaveBeenCalledWith('clicks');

      // Verify get error was logged
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsStorage: Failed to read existing counter',
        'clicks',
        expect.any(Event),
      );

      // Restore spy
      getDBSpy.mockRestore();
    });
  });

  describe('setHistogramStats', () => {
    test('should set histogram stats', async () => {
      const histogramStats = {
        responseTime: { count: 10, min: 50, max: 500, sum: 2500 },
        loadTime: { count: 5, min: 100, max: 1000, sum: 3000 },
      };
      await expect(storage.setHistogramStats(histogramStats)).resolves.toBeUndefined();
    });

    test('should early return if histogram stats is empty', async () => {
      await expect(storage.setHistogramStats({})).resolves.toBeUndefined();
    });

    test('should handle put request errors', async () => {
      const testHistogramStats = { responseTime: { count: 10, min: 50, max: 500, sum: 2500 } };

      // Create mock requests
      const mockGetRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        result: undefined, // No existing value
      };

      const mockPutRequest = {
        onerror: null as ((event: Event) => void) | null,
      };

      // Mock the store get and put methods (setHistogramStats uses read-modify-write)
      const mockStore = {
        get: jest.fn().mockImplementation(() => {
          // Simulate successful get (no existing value)
          setTimeout(() => {
            if (mockGetRequest.onsuccess) {
              mockGetRequest.onsuccess(new Event('success'));
            }
          }, 0);
          return mockGetRequest;
        }),
        put: jest.fn().mockImplementation(() => {
          // Simulate async error by triggering onerror after handlers are set
          setTimeout(() => {
            if (mockPutRequest.onerror) {
              const errorEvent = new Event('error');
              mockPutRequest.onerror(errorEvent);
            }
            // Also trigger transaction abort
            if (mockTransaction.onabort) {
              const abortEvent = new Event('abort');
              mockTransaction.onabort(abortEvent);
            }
          }, 0);
          return mockPutRequest;
        }),
      };

      // Mock the transaction that will abort due to put error
      const mockTransaction = {
        oncomplete: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        objectStore: jest.fn().mockReturnValue(mockStore),
      };

      // Mock the database
      const mockDB = {
        transaction: jest.fn().mockReturnValue(mockTransaction),
      };

      // Spy on getDB and make it return our mock database
      const getDBSpy = jest.spyOn(storage, 'getDB').mockResolvedValue(mockDB as unknown as IDBDatabase);

      // The setHistogramStats should handle the error gracefully
      await expect(storage.setHistogramStats(testHistogramStats)).resolves.toBeUndefined();

      // Give time for async error to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify both get and put were called
      expect(mockStore.get).toHaveBeenCalledWith('responseTime');
      expect(mockStore.put).toHaveBeenCalledWith({
        key: 'responseTime',
        count: 10,
        min: 50,
        max: 500,
        sum: 2500,
      });

      // Verify both put error and transaction abort were logged
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsStorage: Failed to set histogram stats',
        'responseTime',
        expect.any(Event),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsStorage: Failed to set histogram stats',
        expect.any(Event),
      );

      // Restore spy
      getDBSpy.mockRestore();
    });

    test('should handle error when openDB promise rejects', async () => {
      const testHistogramStats = { responseTime: { count: 10, min: 50, max: 500, sum: 2500 } };
      const testError = new Error('Failed to open IndexedDB');
      const openDBSpy = jest.spyOn(storage, 'openDB').mockRejectedValue(testError);

      // The setHistogramStats should handle the error gracefully
      await expect(storage.setHistogramStats(testHistogramStats)).resolves.toBeUndefined();

      // Verify error was logged
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsStorage: Failed to set histogram stats', testError);

      // Restore spy
      openDBSpy.mockRestore();
    });

    test('should handle get request error when reading existing histogram', async () => {
      const testHistogramStats = { responseTime: { count: 10, min: 50, max: 500, sum: 2500 } };

      // Create mock requests
      const mockGetRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        result: undefined,
      };

      // Mock the transaction first so we can reference it
      const mockTransaction = {
        oncomplete: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        objectStore: jest.fn(),
      };

      // Mock the store get method to return a request that will fail
      const mockStore = {
        get: jest.fn().mockImplementation(() => {
          // Simulate async error by triggering onerror after handlers are set
          setTimeout(() => {
            if (mockGetRequest.onerror) {
              const errorEvent = new Event('error');
              mockGetRequest.onerror(errorEvent);
            }
            // Also trigger transaction complete to resolve the Promise
            if (mockTransaction.oncomplete) {
              mockTransaction.oncomplete(new Event('complete'));
            }
          }, 0);
          return mockGetRequest;
        }),
        put: jest.fn().mockReturnValue({ onerror: null }),
      };

      // Set up the mock store reference
      mockTransaction.objectStore.mockReturnValue(mockStore);

      // Mock the database
      const mockDB = {
        transaction: jest.fn().mockReturnValue(mockTransaction),
      };

      // Spy on getDB and make it return our mock database
      const getDBSpy = jest.spyOn(storage, 'getDB').mockResolvedValue(mockDB as unknown as IDBDatabase);

      // The setHistogramStats should handle the error gracefully
      await expect(storage.setHistogramStats(testHistogramStats)).resolves.toBeUndefined();

      // Give time for async error to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify the get request was attempted
      expect(mockStore.get).toHaveBeenCalledWith('responseTime');

      // Verify get error was logged
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsStorage: Failed to read existing histogram stats',
        'responseTime',
        expect.any(Event),
      );

      // Restore spy
      getDBSpy.mockRestore();
    });
  });

  describe('addEventRecords', () => {
    // Helper function to clear events table after each test
    afterEach(async () => {
      try {
        const dbName = `AMP_diagnostics_${apiKey.substring(0, 10)}`;
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(dbName, 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            // Create the events table if it doesn't exist
            if (!db.objectStoreNames.contains('events')) {
              const eventsStore = db.createObjectStore('events', {
                keyPath: 'id',
                autoIncrement: true,
              });
              eventsStore.createIndex('time_idx', 'time', { unique: false });
            }
          };
        });

        // Only clear if the events table exists
        if (db.objectStoreNames.contains('events')) {
          const transaction = db.transaction(['events'], 'readwrite');
          const store = transaction.objectStore('events');

          await new Promise<void>((resolve, reject) => {
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => resolve();
            clearRequest.onerror = () => reject(clearRequest.error);
          });
        }

        db.close();
      } catch (error) {
        // Ignore errors - the database might not exist yet for early return tests
      }
    });

    test('should add event records', async () => {
      const events = [
        { event_name: 'page_view', time: Date.now(), event_properties: { page: '/home' } },
        { event_name: 'button_click', time: Date.now() + 1000, event_properties: { button_id: 'submit' } },
      ];
      await expect(storage.addEventRecords(events)).resolves.toBeUndefined();
    });

    test('should limit to at most 10 events in database', async () => {
      // First, add exactly 10 events
      const firstBatch = [];
      const baseTime = Date.now();
      for (let i = 0; i < 10; i++) {
        firstBatch.push({
          event_name: `event_${i}`,
          time: baseTime + i * 1000,
          event_properties: { index: i },
        });
      }

      await expect(storage.addEventRecords(firstBatch)).resolves.toBeUndefined();

      // Clear previous debug calls to focus on the limit-exceeding call
      jest.clearAllMocks();

      // Try to add 2 more events - these should be rejected
      const secondBatch = [
        { event_name: 'event_10', time: baseTime + 10000, event_properties: { index: 10 } },
        { event_name: 'event_11', time: baseTime + 11000, event_properties: { index: 11 } },
      ];

      await expect(storage.addEventRecords(secondBatch)).resolves.toBeUndefined();

      // Verify debug log was called indicating 0 events added due to storage limit
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsStorage: Only added 0 of 2 events due to storage limit',
      );

      // Verify still only 10 events in database
      const dbName = `AMP_diagnostics_${apiKey.substring(0, 10)}`;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const transaction = db.transaction(['events'], 'readonly');
      const store = transaction.objectStore('events');

      const allRecords = await new Promise<Array<{ event_name: string; time: number; event_properties: any }>>(
        (resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        },
      );

      // Should still have exactly 10 events (the original ones)
      expect(allRecords).toHaveLength(10);

      // Verify the events are the original ones (event_0 to event_9)
      const sortedRecords = allRecords.sort((a, b) => a.time - b.time);
      expect(sortedRecords[0].event_name).toBe('event_0');
      expect(sortedRecords[9].event_name).toBe('event_9');

      db.close();
    });

    test('should add partial batch when space is limited', async () => {
      // First, add 8 events
      const firstBatch = [];
      const baseTime = Date.now();
      for (let i = 0; i < 8; i++) {
        firstBatch.push({
          event_name: `event_${i}`,
          time: baseTime + i * 1000,
          event_properties: { index: i },
        });
      }

      await expect(storage.addEventRecords(firstBatch)).resolves.toBeUndefined();

      // Clear previous debug calls to focus on the limit-exceeding call
      jest.clearAllMocks();

      // Try to add 5 more events - only 2 should be added (the least recent ones)
      const secondBatch = [];
      for (let i = 8; i < 13; i++) {
        secondBatch.push({
          event_name: `event_${i}`,
          time: baseTime + i * 1000,
          event_properties: { index: i },
        });
      }

      await expect(storage.addEventRecords(secondBatch)).resolves.toBeUndefined();

      // Verify debug log was called indicating only 2 of 5 events were added
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsStorage: Only added 2 of 5 events due to storage limit',
      );

      // Verify exactly 10 events in database
      const dbName = `AMP_diagnostics_${apiKey.substring(0, 10)}`;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      const transaction = db.transaction(['events'], 'readonly');
      const store = transaction.objectStore('events');

      const allRecords = await new Promise<Array<{ event_name: string; time: number; event_properties: any }>>(
        (resolve, reject) => {
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        },
      );

      // Should have exactly 10 events
      expect(allRecords).toHaveLength(10);

      // Verify we have the first 8 events plus the first 2 from the second batch (least recent)
      const sortedRecords = allRecords.sort((a, b) => a.time - b.time);
      expect(sortedRecords[0].event_name).toBe('event_0');
      expect(sortedRecords[7].event_name).toBe('event_7');
      expect(sortedRecords[8].event_name).toBe('event_8'); // First from second batch
      expect(sortedRecords[9].event_name).toBe('event_9'); // Second from second batch

      db.close();
    });

    test('should early return if events is empty', async () => {
      await expect(storage.addEventRecords([])).resolves.toBeUndefined();
    });

    test('should handle add request errors', async () => {
      const testEvents = [{ event_name: 'page_view', time: Date.now(), event_properties: { page: '/home' } }];

      // Create a mock add request that will automatically trigger error
      const mockAddRequest = {
        onerror: null as ((event: Event) => void) | null,
      };

      // Create a mock count request that succeeds
      const mockCountRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        result: 0, // Simulate empty database
      };

      // Mock the store with both count and add methods
      const mockStore = {
        count: jest.fn().mockImplementation(() => {
          // Simulate successful count
          setTimeout(() => {
            if (mockCountRequest.onsuccess) {
              mockCountRequest.onsuccess(new Event('success'));
            }
          }, 0);
          return mockCountRequest;
        }),
        add: jest.fn().mockImplementation(() => {
          // Simulate async error by triggering onerror after handlers are set
          setTimeout(() => {
            if (mockAddRequest.onerror) {
              const errorEvent = new Event('error');
              mockAddRequest.onerror(errorEvent);
            }
            // Also trigger transaction completion (even with errors, transaction can complete)
            if (mockTransaction.oncomplete) {
              const completeEvent = new Event('complete');
              mockTransaction.oncomplete(completeEvent);
            }
          }, 0);
          return mockAddRequest;
        }),
      };

      // Mock the transaction
      const mockTransaction = {
        oncomplete: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        objectStore: jest.fn().mockReturnValue(mockStore),
      };

      // Mock the database
      const mockDB = {
        transaction: jest.fn().mockReturnValue(mockTransaction),
      };

      // Spy on getDB and make it return our mock database
      const getDBSpy = jest.spyOn(storage, 'getDB').mockResolvedValue(mockDB as unknown as IDBDatabase);

      // The addEventRecords should handle the error gracefully
      await expect(storage.addEventRecords(testEvents)).resolves.toBeUndefined();

      // Give time for async error to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify the count request was attempted first
      expect(mockStore.count).toHaveBeenCalled();

      // Verify the add request was attempted
      expect(mockStore.add).toHaveBeenCalledWith({
        event_name: 'page_view',
        event_properties: { page: '/home' },
        time: expect.any(Number) as number,
      });

      // Verify error was logged
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsStorage: Failed to add event record',
        expect.any(Event),
      );

      // Restore spy
      getDBSpy.mockRestore();
    });

    test('should handle count request error', async () => {
      const testEvents = [{ event_name: 'page_view', time: Date.now(), event_properties: { page: '/home' } }];

      // Create a mock count request that will fail
      const mockCountRequest = {
        onsuccess: null as ((event: Event) => void) | null,
        onerror: null as ((event: Event) => void) | null,
        result: undefined,
      };

      // Mock the transaction first so we can reference it
      const mockTransaction = {
        oncomplete: null as ((event: Event) => void) | null,
        onabort: null as ((event: Event) => void) | null,
        objectStore: jest.fn(),
      };

      // Mock the store with count method that fails
      const mockStore = {
        count: jest.fn().mockImplementation(() => {
          // Simulate async error by triggering onerror after handlers are set
          setTimeout(() => {
            if (mockCountRequest.onerror) {
              const errorEvent = new Event('error');
              mockCountRequest.onerror(errorEvent);
            }
            // Also trigger transaction complete to resolve the Promise
            if (mockTransaction.oncomplete) {
              mockTransaction.oncomplete(new Event('complete'));
            }
          }, 0);
          return mockCountRequest;
        }),
      };

      // Set up the mock store reference
      mockTransaction.objectStore.mockReturnValue(mockStore);

      // Mock the database
      const mockDB = {
        transaction: jest.fn().mockReturnValue(mockTransaction),
      };

      // Spy on getDB and make it return our mock database
      const getDBSpy = jest.spyOn(storage, 'getDB').mockResolvedValue(mockDB as unknown as IDBDatabase);

      // The addEventRecords should handle the error gracefully
      await expect(storage.addEventRecords(testEvents)).resolves.toBeUndefined();

      // Give time for async error to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify the count request was attempted
      expect(mockStore.count).toHaveBeenCalled();

      // Verify count error was logged
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsStorage: Failed to count existing events',
        expect.any(Event),
      );

      // Restore spy
      getDBSpy.mockRestore();
    });

    test('should handle error when openDB promise rejects', async () => {
      const testEvents = [{ event_name: 'page_view', time: Date.now(), event_properties: { page: '/home' } }];
      const testError = new Error('Failed to open IndexedDB');
      const openDBSpy = jest.spyOn(storage, 'openDB').mockRejectedValue(testError);

      // The addEventRecords should handle the error gracefully
      await expect(storage.addEventRecords(testEvents)).resolves.toBeUndefined();

      // Verify error was logged
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsStorage: Failed to add event records', testError);

      // Restore spy
      openDBSpy.mockRestore();
    });
  });

  describe('setInternal', () => {
    test('should set internal value', async () => {
      await expect(storage.setInternal('lastFlushTimestamp', '1234567890')).resolves.toBeUndefined();
    });
  });

  describe('getInternal', () => {
    test('should return undefined for non-existent key', async () => {
      await expect(storage.getInternal('nonExistentKey')).resolves.toBeUndefined();
    });

    test('should get internal value after setting it', async () => {
      const key = 'testKey';
      const value = 'testValue';

      // Set the value first
      await storage.setInternal(key, value);

      // Then get it back
      const result = await storage.getInternal(key);
      expect(result).toEqual({ key, value });
    });

    test('should return undefined when openDB promise rejects', async () => {
      const testError = new Error('Failed to open IndexedDB');
      const openDBSpy = jest.spyOn(storage, 'openDB').mockRejectedValue(testError);

      const result = await storage.getInternal('testKey');

      expect(result).toBeUndefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsStorage: Failed to get internal value', testError);

      openDBSpy.mockRestore();
    });
  });

  describe('setLastFlushTimestamp', () => {
    test('should set last flush timestamp', async () => {
      const spy = jest.spyOn(storage, 'setInternal');
      const timestamp = Date.now();
      await expect(storage.setLastFlushTimestamp(timestamp)).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith('last_flush_timestamp', timestamp.toString());
      spy.mockRestore();
    });
  });

  describe('getLastFlushTimestamp', () => {
    test('should get last flush timestamp after setting it', async () => {
      const spy = jest.spyOn(storage, 'getInternal');
      const timestamp = 1234567890000;

      // Set the timestamp first
      await storage.setLastFlushTimestamp(timestamp);

      // Then get it back
      const result = await storage.getLastFlushTimestamp();
      expect(result).toBe(timestamp);
      expect(spy).toHaveBeenCalledWith('last_flush_timestamp');
      spy.mockRestore();
    });

    test('should return undefined when getInternal returns undefined', async () => {
      const spy = jest.spyOn(storage, 'getInternal').mockResolvedValue(undefined);

      const result = await storage.getLastFlushTimestamp();

      expect(result).toBeUndefined();
      expect(spy).toHaveBeenCalledWith('last_flush_timestamp');
      spy.mockRestore();
    });
  });
});
