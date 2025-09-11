import { ILogger } from '../../src/logger';
import {
  DiagnosticsClient,
  DIAGNOSTICS_US_SERVER_URL,
  DIAGNOSTICS_EU_SERVER_URL,
  FLUSH_INTERVAL_MS,
  SAVE_INTERVAL_MS,
} from '../../src/diagnostics/diagnostics-client';

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

describe('DiagnosticsClient', () => {
  let initializeFlushIntervalSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    // Mock initializeFlushInterval globally to prevent async operations
    initializeFlushIntervalSpy = jest
      .spyOn(DiagnosticsClient.prototype, 'initializeFlushInterval')
      .mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.clearAllTimers();
    initializeFlushIntervalSpy.mockRestore();
  });

  describe('constructor', () => {
    test('should create DiagnosticsClient with required parameters', () => {
      const client = new DiagnosticsClient(apiKey, mockLogger);

      expect(client.apiKey).toBe(apiKey);
      expect(client.logger).toBe(mockLogger);
      expect(client.serverUrl).toBe(DIAGNOSTICS_US_SERVER_URL);
      expect(client.storage).toBeDefined();
      expect(client.inMemoryTags).toEqual({});
      expect(client.inMemoryCounters).toEqual({});
      expect(client.inMemoryHistograms).toEqual({});
      expect(client.inMemoryEvents).toEqual([]);
      expect(client.saveTimer).toBeNull();
      expect(client.flushTimer).toBeNull();
      expect(initializeFlushIntervalSpy).toHaveBeenCalledTimes(1);
    });

    test('should create DiagnosticsClient with EU server zone', () => {
      const client = new DiagnosticsClient(apiKey, mockLogger, 'EU');

      expect(client.serverUrl).toBe(DIAGNOSTICS_EU_SERVER_URL);
    });
  });

  describe('initializeFlushInterval', () => {
    let mockStorage: {
      getLastFlushTimestamp: jest.MockedFunction<() => Promise<number | undefined>>;
    };
    let client: DiagnosticsClient;
    let flushSpy: jest.SpyInstance;

    beforeEach(() => {
      // Restore the real initializeFlushInterval method for this describe block
      initializeFlushIntervalSpy.mockRestore();

      mockStorage = {
        getLastFlushTimestamp: jest.fn(),
      };
      flushSpy = jest.spyOn(DiagnosticsClient.prototype, '_flush').mockResolvedValue();
    });

    afterEach(() => {
      // Clean up timer if it exists
      if (client?.flushTimer) {
        clearTimeout(client.flushTimer);
      }
      flushSpy.mockRestore();

      // Re-establish the mock for other describe blocks
      initializeFlushIntervalSpy = jest
        .spyOn(DiagnosticsClient.prototype, 'initializeFlushInterval')
        .mockImplementation(() => Promise.resolve());
    });

    const createClientWithMockStorage = (timestampValue: number | undefined) => {
      mockStorage.getLastFlushTimestamp.mockResolvedValue(timestampValue);
      client = new DiagnosticsClient(apiKey, mockLogger);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      client.storage = mockStorage as any;
      return client;
    };

    test('should early return for new client', async () => {
      createClientWithMockStorage(undefined);

      await client.initializeFlushInterval();

      expect(mockStorage.getLastFlushTimestamp).toHaveBeenCalled();
      expect(flushSpy).not.toHaveBeenCalled();
      expect(client.flushTimer).toBeNull();
    });

    test('should flush immediately if 5 minutes have passed since last flush', async () => {
      const oldTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
      createClientWithMockStorage(oldTimestamp);

      await client.initializeFlushInterval();

      expect(mockStorage.getLastFlushTimestamp).toHaveBeenCalled();
      expect(flushSpy).toHaveBeenCalled();
      expect(client.flushTimer).toBeNull();
    });

    test('should set timer for remaining time if less than 5 minutes have passed since last flush', async () => {
      jest.useFakeTimers();
      const pastTime = 2 * 60 * 1000;
      const recentTimestamp = Date.now() - pastTime; // 2 minutes ago
      createClientWithMockStorage(recentTimestamp);

      await client.initializeFlushInterval();

      expect(mockStorage.getLastFlushTimestamp).toHaveBeenCalled();
      expect(flushSpy).not.toHaveBeenCalled();
      expect(client.flushTimer).not.toBeNull();
      jest.advanceTimersByTime(FLUSH_INTERVAL_MS - pastTime);
      expect(flushSpy).toHaveBeenCalled();

      jest.useRealTimers();
    });

    test('should handle flush promise rejection and clear timer', async () => {
      jest.useFakeTimers();
      const pastTime = 2 * 60 * 1000;
      const recentTimestamp = Date.now() - pastTime; // 2 minutes ago
      const flushError = new Error('Flush operation failed');

      createClientWithMockStorage(recentTimestamp);
      flushSpy.mockRejectedValue(flushError);

      await client.initializeFlushInterval();

      expect(mockStorage.getLastFlushTimestamp).toHaveBeenCalled();
      expect(flushSpy).not.toHaveBeenCalled(); // Should not flush immediately
      expect(client.flushTimer).not.toBeNull(); // Timer should be set

      // Wait for all promises to resolve
      await jest.runAllTimersAsync();

      expect(flushSpy).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsClient: Failed to flush', flushError);

      // Timer should be cleared even on error
      expect(client.flushTimer).toBeNull();

      jest.useRealTimers();
    });
  });

  describe('setters', () => {
    let client: DiagnosticsClient;
    let startSaveTimerIfNeededSpy: jest.SpyInstance;

    beforeEach(() => {
      client = new DiagnosticsClient(apiKey, mockLogger);
      startSaveTimerIfNeededSpy = jest.spyOn(client, 'startTimersIfNeeded').mockImplementation(() => {
        // Mock implementation
      });
    });

    afterEach(() => {
      // Clear any timers that might have been set
      if (client?.saveTimer) {
        clearTimeout(client.saveTimer);
        client.saveTimer = null;
      }
      if (client?.flushTimer) {
        clearTimeout(client.flushTimer);
        client.flushTimer = null;
      }
      startSaveTimerIfNeededSpy.mockRestore();
      jest.clearAllTimers();
    });

    test('setTag', () => {
      const key = 'library';
      const value = 'amplitude-typescript/2.0.0';

      client.setTag(key, value);

      expect(client.inMemoryTags).toEqual({ [key]: value });
      expect(startSaveTimerIfNeededSpy).toHaveBeenCalled();
    });

    test('increment', () => {
      const key = 'analytics.fileNotFound';
      const size = 3;

      client.increment(key, size);

      expect(client.inMemoryCounters).toEqual({ [key]: size });
      expect(startSaveTimerIfNeededSpy).toHaveBeenCalled();
    });

    test('increment with default size', () => {
      const key = 'analytics.fileNotFound';

      client.increment(key);

      expect(client.inMemoryCounters).toEqual({ [key]: 1 });
      expect(startSaveTimerIfNeededSpy).toHaveBeenCalled();
    });

    test('recordHistogram', () => {
      client.recordHistogram('sr.time', 50);
      client.recordHistogram('sr.time', 100);
      client.recordHistogram('sr.time', 150);
      client.recordHistogram('sr.time', 100);

      expect(client.inMemoryHistograms).toEqual({
        'sr.time': {
          count: 4,
          min: 50,
          max: 150,
          sum: 400,
        },
      });
      expect(startSaveTimerIfNeededSpy).toHaveBeenCalled();
    });

    test('recordEvent', () => {
      const eventName = 'error';
      const properties = { stack_trace: 'test stack trace' };

      client.recordEvent(eventName, properties);

      expect(client.inMemoryEvents).toHaveLength(1);
      expect(client.inMemoryEvents[0]).toEqual({
        event_name: eventName,
        time: expect.any(Number) as number,
        event_properties: properties,
      });
      expect(startSaveTimerIfNeededSpy).toHaveBeenCalled();
    });
  });

  describe('startSaveTimerIfNeeded', () => {
    let client: DiagnosticsClient;
    let saveAllDataToStorageSpy: jest.SpyInstance;
    let flushSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.useFakeTimers();
      client = new DiagnosticsClient(apiKey, mockLogger);
      saveAllDataToStorageSpy = jest.spyOn(client, 'saveAllDataToStorage').mockResolvedValue();
      flushSpy = jest.spyOn(client, '_flush').mockResolvedValue();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
      saveAllDataToStorageSpy.mockRestore();
      flushSpy.mockRestore();
    });

    test('should set saveTimer if it is not set', () => {
      client.saveTimer = null;

      client.startTimersIfNeeded();

      expect(client.saveTimer).not.toBeNull();
      jest.advanceTimersByTime(SAVE_INTERVAL_MS);
      expect(saveAllDataToStorageSpy).toHaveBeenCalled();
    });

    test('should not set saveTimer if it is already set', () => {
      client.saveTimer = setTimeout(() => {
        // Mock timer callback
      }, 500);
      const originalTimer = client.saveTimer;

      client.startTimersIfNeeded();

      expect(client.saveTimer).toBe(originalTimer);
    });

    test('should set flushTimer if it is not set', () => {
      client.flushTimer = null;

      client.startTimersIfNeeded();

      expect(client.flushTimer).not.toBeNull();
      jest.advanceTimersByTime(FLUSH_INTERVAL_MS);
      expect(flushSpy).toHaveBeenCalled();
    });

    test('should not set flushTimer if it is already set', () => {
      client.flushTimer = setTimeout(() => {
        // Mock timer callback
      }, FLUSH_INTERVAL_MS);
      const originalTimer = client.flushTimer;

      client.startTimersIfNeeded();

      expect(client.flushTimer).toBe(originalTimer);
    });

    test('should handle saveAllDataToStorage errors in timer callback and clear timer', async () => {
      const storageError = new Error('Storage failed');
      saveAllDataToStorageSpy.mockRejectedValue(storageError);
      client.saveTimer = null;

      client.startTimersIfNeeded();

      expect(client.saveTimer).not.toBeNull();

      // Wait for all promises to resolve
      await jest.runAllTimersAsync();

      expect(saveAllDataToStorageSpy).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsClient: Failed to save all data to storage',
        storageError,
      );

      // Timer should be cleared even on error
      expect(client.saveTimer).toBeNull();
    });

    test('should handle _flush errors in timer callback and clear timer', async () => {
      const flushError = new Error('Flush failed');
      flushSpy.mockRejectedValue(flushError);
      client.flushTimer = null;

      client.startTimersIfNeeded();

      expect(client.flushTimer).not.toBeNull();

      // Wait for all promises to resolve
      await jest.runAllTimersAsync();

      expect(flushSpy).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsClient: Failed to flush', flushError);

      // Timer should be cleared even on error
      expect(client.flushTimer).toBeNull();
    });
  });

  describe('saveAllDataToStorage', () => {
    let client: DiagnosticsClient;
    let mockStorage: {
      setTags: jest.MockedFunction<(tags: Record<string, string>) => Promise<void>>;
      incrementCounters: jest.MockedFunction<(counters: Record<string, number>) => Promise<void>>;
      setHistogramStats: jest.MockedFunction<(histograms: Record<string, any>) => Promise<void>>;
      addEventRecords: jest.MockedFunction<(events: any[]) => Promise<void>>;
    };

    // Test data constants
    const TEST_TAGS = { library: 'amplitude-typescript/2.0.0', platform: 'web' };
    const TEST_COUNTERS = { 'analytics.error': 5, 'network.retry': 3 };
    const TEST_HISTOGRAMS = { 'sr.time': { count: 2, min: 50, max: 100, sum: 150 } };
    const TEST_EVENTS = [{ event_name: 'error', time: 123456789, event_properties: { type: 'network' } }];

    beforeEach(() => {
      client = new DiagnosticsClient(apiKey, mockLogger);
      mockStorage = {
        setTags: jest.fn().mockResolvedValue(undefined),
        incrementCounters: jest.fn().mockResolvedValue(undefined),
        setHistogramStats: jest.fn().mockResolvedValue(undefined),
        addEventRecords: jest.fn().mockResolvedValue(undefined),
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      client.storage = mockStorage as any;
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    test('should save all in-memory data to storage and clear memory', async () => {
      // Set up in-memory data
      client.inMemoryTags = { ...TEST_TAGS };
      client.inMemoryCounters = { ...TEST_COUNTERS };
      client.inMemoryHistograms = { ...TEST_HISTOGRAMS };
      client.inMemoryEvents = [...TEST_EVENTS];

      await client.saveAllDataToStorage();

      // Verify storage methods were called with correct data
      expect(mockStorage.setTags).toHaveBeenCalledWith(TEST_TAGS);
      expect(mockStorage.incrementCounters).toHaveBeenCalledWith(TEST_COUNTERS);
      expect(mockStorage.setHistogramStats).toHaveBeenCalledWith(TEST_HISTOGRAMS);
      expect(mockStorage.addEventRecords).toHaveBeenCalledWith(TEST_EVENTS);

      // Verify in-memory data is cleared
      expect(client.inMemoryTags).toEqual({});
      expect(client.inMemoryCounters).toEqual({});
      expect(client.inMemoryHistograms).toEqual({});
      expect(client.inMemoryEvents).toEqual([]);

      // Verify saveTimer is cleared
      expect(client.saveTimer).toBeNull();
    });
  });

  describe('_flush', () => {
    let client: DiagnosticsClient;
    let mockStorage: {
      getAllAndClear: jest.MockedFunction<
        () => Promise<{
          tags: Array<{ key: string; value: string }>;
          counters: Array<{ key: string; value: number }>;
          histogramStats: Array<{ key: string; count: number; min: number; max: number; sum: number }>;
          events: Array<{ event_name: string; time: number; event_properties: any }>;
        }>
      >;
      setLastFlushTimestamp: jest.MockedFunction<(timestamp: number) => Promise<void>>;
    };
    let fetchSpy: jest.SpyInstance;

    // Test data constants for storage records
    const MOCK_TAG_RECORDS = [
      { key: 'library', value: 'amplitude-typescript/2.0.0' },
      { key: 'platform', value: 'web' },
    ];
    const MOCK_COUNTER_RECORDS = [
      { key: 'analytics.error', value: 5 },
      { key: 'network.retry', value: 3 },
    ];
    const MOCK_HISTOGRAM_RECORDS = [{ key: 'sr.time', count: 2, min: 50, max: 100, sum: 150 }];
    const MOCK_EVENT_RECORDS = [{ event_name: 'error', time: 123456789, event_properties: { type: 'network' } }];

    // Expected transformed data
    const EXPECTED_TAGS = { library: 'amplitude-typescript/2.0.0', platform: 'web' };
    const EXPECTED_COUNTERS = { 'analytics.error': 5, 'network.retry': 3 };
    const EXPECTED_HISTOGRAMS = { 'sr.time': { count: 2, min: 50, max: 100, avg: 75 } };
    // const EXPECTED_EVENTS = [{ event_name: 'error', time: 123456789, event_properties: { type: 'network' } }];

    beforeEach(() => {
      client = new DiagnosticsClient(apiKey, mockLogger);
      mockStorage = {
        getAllAndClear: jest.fn().mockResolvedValue({
          tags: MOCK_TAG_RECORDS,
          counters: MOCK_COUNTER_RECORDS,
          histogramStats: MOCK_HISTOGRAM_RECORDS,
          events: MOCK_EVENT_RECORDS,
        }),
        setLastFlushTimestamp: jest.fn().mockResolvedValue(undefined),
      };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      client.storage = mockStorage as any;
      fetchSpy = jest.spyOn(client, 'fetch').mockResolvedValue();
    });

    afterEach(() => {
      jest.clearAllMocks();
      fetchSpy.mockRestore();
    });

    test('should call necessary APIs', async () => {
      client.flushTimer = setTimeout(() => {
        // Mock timer callback
      }, 1000);

      await client._flush();

      expect(mockStorage.getAllAndClear).toHaveBeenCalled();
      expect(mockStorage.setLastFlushTimestamp).toHaveBeenCalled();
      // Also test histogram calculation
      expect(fetchSpy).toHaveBeenCalledWith({
        tags: EXPECTED_TAGS,
        histogram: EXPECTED_HISTOGRAMS,
        counters: EXPECTED_COUNTERS,
        // events: EXPECTED_EVENTS,
      });
    });
  });

  describe('fetch', () => {
    let client: DiagnosticsClient;
    let mockFetch: jest.SpyInstance;

    // Test payload constant
    const TEST_PAYLOAD = {
      tags: { library: 'amplitude-typescript/2.0.0', platform: 'web' },
      histogram: { 'sr.time': { count: 2, min: 50, max: 100, avg: 75 } },
      counters: { 'analytics.error': 5, 'network.retry': 3 },
      events: [{ event_name: 'error', time: 123456789, event_properties: { type: 'network' } }],
    };

    beforeEach(() => {
      client = new DiagnosticsClient(apiKey, mockLogger);
      mockFetch = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
      mockFetch.mockRestore();
      jest.clearAllMocks();
    });

    test('should send POST request with correct parameters', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
      };
      mockFetch.mockResolvedValue(mockResponse as Response);

      await client.fetch(TEST_PAYLOAD);

      expect(mockFetch).toHaveBeenCalledWith(client.serverUrl, {
        method: 'POST',
        headers: {
          'X-ApiKey': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(TEST_PAYLOAD),
      });
    });

    test('should log success message on successful response', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
      };
      mockFetch.mockResolvedValue(mockResponse as Response);

      await client.fetch(TEST_PAYLOAD);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsClient: Successfully sent diagnostics data');
    });

    test('should log error message on HTTP error response', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      };
      mockFetch.mockResolvedValue(mockResponse as Response);

      await client.fetch(TEST_PAYLOAD);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsClient: Failed to send diagnostics data.');
    });

    test('should log error message on fetch exception', async () => {
      const error = new Error('error');
      mockFetch.mockRejectedValue(error);

      await client.fetch(TEST_PAYLOAD);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsClient: Failed to send diagnostics data', error);
    });

    test('should use US server URL by default', async () => {
      const usClient = new DiagnosticsClient(apiKey, mockLogger);
      const mockResponse = { ok: true, status: 200, statusText: 'OK' };
      mockFetch.mockResolvedValue(mockResponse as Response);

      await usClient.fetch(TEST_PAYLOAD);

      expect(mockFetch).toHaveBeenCalledWith(DIAGNOSTICS_US_SERVER_URL, expect.any(Object));
    });

    test('should use EU server URL when specified', async () => {
      const euClient = new DiagnosticsClient(apiKey, mockLogger, 'EU');
      const mockResponse = { ok: true, status: 200, statusText: 'OK' };
      mockFetch.mockResolvedValue(mockResponse as Response);

      await euClient.fetch(TEST_PAYLOAD);

      expect(mockFetch).toHaveBeenCalledWith(DIAGNOSTICS_EU_SERVER_URL, expect.any(Object));
    });
  });
});
