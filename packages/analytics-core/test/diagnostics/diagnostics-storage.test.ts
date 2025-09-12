import 'fake-indexeddb/auto';
import { DiagnosticsStorage } from '../../src/diagnostics/diagnostics-storage';
import { ILogger } from '../../src/logger';

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
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with apiKey and logger', () => {
      expect(storage.dbName).toBe('AMP_diagnostics_1234567890');
      expect(storage.logger).toBe(mockLogger);
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

  describe('setTags', () => {
    test('should set tags', async () => {
      await expect(storage.setTags({ test: 'test' })).resolves.toBeUndefined();
    });

    test('should early return if tags is empty', async () => {
      await expect(storage.setTags({})).resolves.toBeUndefined();
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
