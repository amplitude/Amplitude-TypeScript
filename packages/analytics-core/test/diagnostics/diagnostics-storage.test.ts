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
  });

  describe('incrementCounters', () => {
    test('should increment counters', async () => {
      await expect(storage.incrementCounters({ clicks: 5, errors: 1 })).resolves.toBeUndefined();
    });

    test('should early return if counters is empty', async () => {
      await expect(storage.incrementCounters({})).resolves.toBeUndefined();
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
  });

  describe('addEventRecords', () => {
    test('should add event records', async () => {
      const events = [
        { event_name: 'page_view', time: Date.now(), event_properties: { page: '/home' } },
        { event_name: 'button_click', time: Date.now() + 1000, event_properties: { button_id: 'submit' } },
      ];
      await expect(storage.addEventRecords(events)).resolves.toBeUndefined();
    });

    test('should early return if events is empty', async () => {
      await expect(storage.addEventRecords([])).resolves.toBeUndefined();
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
  });
});
