import { ILogger } from '../../src/logger';
import {
  DiagnosticsClient,
  DIAGNOSTICS_US_SERVER_URL,
  DIAGNOSTICS_EU_SERVER_URL,
  FLUSH_INTERVAL_MS,
  SAVE_INTERVAL_MS,
  MAX_MEMORY_STORAGE_COUNT,
} from '../../src/diagnostics/diagnostics-client';
import { DiagnosticsStorage } from '../../src/diagnostics/diagnostics-storage';
import { getGlobalScope } from '../../src/global-scope';
import { isTimestampInSample } from '../../src/utils/sampling';

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

// Mock the DiagnosticsStorage module
jest.mock('../../src/diagnostics/diagnostics-storage');
jest.mock('../../src/global-scope');

// Mock the sampling utils
jest.mock('../../src/utils/sampling', () => ({
  isTimestampInSample: jest.fn(),
}));

describe('DiagnosticsClient', () => {
  let initializeFlushIntervalSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    // Mock initializeFlushInterval globally to prevent async operations
    initializeFlushIntervalSpy = jest
      .spyOn(DiagnosticsClient.prototype, 'initializeFlushInterval')
      .mockImplementation(() => Promise.resolve());

    // Mock isTimestampInSample to return true
    (isTimestampInSample as jest.Mock).mockReturnValue(true);

    // Set up DiagnosticsStorage mock
    (DiagnosticsStorage.isSupported as jest.Mock).mockReturnValue(true);
    (DiagnosticsStorage as jest.MockedClass<typeof DiagnosticsStorage>).mockImplementation(
      () =>
        ({
          setTags: jest.fn(),
          incrementCounters: jest.fn(),
          setHistogramStats: jest.fn(),
          addEventRecords: jest.fn(),
          setLastFlushTimestamp: jest.fn(),
          getLastFlushTimestamp: jest.fn(),
          getAllAndClear: jest.fn(),
        } as unknown as DiagnosticsStorage),
    );
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
      expect(client.shouldTrack).toBe(true);
      expect(initializeFlushIntervalSpy).toHaveBeenCalledTimes(1);
    });

    test('should create DiagnosticsClient with EU server zone', () => {
      const client = new DiagnosticsClient(apiKey, mockLogger, 'EU');

      expect(client.serverUrl).toBe(DIAGNOSTICS_EU_SERVER_URL);
    });

    test('should debug log when storage is not supported', () => {
      (DiagnosticsStorage.isSupported as jest.Mock).mockReturnValue(false);
      const client = new DiagnosticsClient(apiKey, mockLogger);

      expect(client.storage).toBeUndefined();
      expect(mockLogger['debug']).toHaveBeenCalledWith('DiagnosticsClient: IndexedDB is not supported');
    });

    test('should set shouldTrack to false if not in sample', () => {
      (isTimestampInSample as jest.Mock).mockReturnValue(false);
      const client = new DiagnosticsClient(apiKey, mockLogger);
      expect(client.shouldTrack).toBe(false);
    });

    test('should set shouldTrack to false if not enabled', () => {
      const client = new DiagnosticsClient(apiKey, mockLogger, 'US', { enabled: false });
      expect(client.shouldTrack).toBe(false);
    });
  });

  describe('initializeFlushInterval', () => {
    let mockStorage: {
      getLastFlushTimestamp: jest.MockedFunction<() => Promise<number | undefined>>;
      setLastFlushTimestamp: jest.MockedFunction<(timestamp: number) => Promise<void>>;
    };
    let client: DiagnosticsClient;
    let flushSpy: jest.SpyInstance;

    beforeEach(() => {
      // Restore the real initializeFlushInterval method for this describe block
      initializeFlushIntervalSpy.mockRestore();

      mockStorage = {
        getLastFlushTimestamp: jest.fn(),
        setLastFlushTimestamp: jest.fn(),
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

      // Mock the storage support check to prevent constructor from calling initializeFlushInterval
      const isStorageSupportedSpy = jest.spyOn(DiagnosticsStorage, 'isSupported').mockReturnValue(false);

      client = new DiagnosticsClient(apiKey, mockLogger);

      // Now set the mock storage after construction
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      client.storage = mockStorage as any;

      // Restore the storage support check
      isStorageSupportedSpy.mockRestore();

      return client;
    };

    test('should early return if storage is not supported', async () => {
      createClientWithMockStorage(undefined);
      client.storage = undefined;

      await client.initializeFlushInterval();

      expect(mockStorage.getLastFlushTimestamp).not.toHaveBeenCalled();
    });

    test('should set timestamp and timer for new client', async () => {
      jest.useFakeTimers();
      createClientWithMockStorage(undefined);

      await client.initializeFlushInterval();

      expect(mockStorage.getLastFlushTimestamp).toHaveBeenCalled();
      expect(mockStorage.setLastFlushTimestamp).toHaveBeenCalledWith(expect.any(Number));
      expect(flushSpy).not.toHaveBeenCalled();
      expect(client.flushTimer).not.toBeNull();

      jest.useRealTimers();
    });

    test('should flush immediately if 5 minutes have passed since last flush', async () => {
      const oldTimestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
      createClientWithMockStorage(oldTimestamp);

      await client.initializeFlushInterval();

      expect(mockStorage.getLastFlushTimestamp).toHaveBeenCalled();
      expect(flushSpy).toHaveBeenCalled();
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

    test('setTag should early return if storage is not supported', () => {
      (DiagnosticsStorage.isSupported as jest.Mock).mockReturnValue(false);
      const client = new DiagnosticsClient(apiKey, mockLogger);

      client.setTag('library', 'amplitude-typescript/2.0.0');

      expect(client.inMemoryTags).toEqual({});
    });

    test('setTag should early return if exceeding memory limit', () => {
      for (let i = 0; i < MAX_MEMORY_STORAGE_COUNT; i++) {
        client.inMemoryTags[`tag${i}`] = `value${i}`;
      }

      expect(Object.keys(client.inMemoryTags).length).toBe(MAX_MEMORY_STORAGE_COUNT);

      client.setTag('library', 'amplitude-typescript/2.0.0');

      expect(Object.keys(client.inMemoryTags).length).toBe(MAX_MEMORY_STORAGE_COUNT);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsClient: Early return setTags as reaching memory limit');
    });

    test('setTag should early return if shouldTrack is false', () => {
      client.shouldTrack = false;
      client.setTag('library', 'amplitude-typescript/2.0.0');
      expect(client.inMemoryTags).toEqual({});
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

    test('increment should early return if storage is not supported', () => {
      (DiagnosticsStorage.isSupported as jest.Mock).mockReturnValue(false);
      const client = new DiagnosticsClient(apiKey, mockLogger);

      client.increment('analytics.fileNotFound', 5);

      expect(client.inMemoryCounters).toEqual({});
    });

    test('increment should early return if exceeding memory limit', () => {
      for (let i = 0; i < MAX_MEMORY_STORAGE_COUNT; i++) {
        client.inMemoryCounters[`counter${i}`] = i;
      }

      expect(Object.keys(client.inMemoryCounters).length).toBe(MAX_MEMORY_STORAGE_COUNT);

      client.increment('analytics.fileNotFound', 5);

      expect(Object.keys(client.inMemoryCounters).length).toBe(MAX_MEMORY_STORAGE_COUNT);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsClient: Early return increment as reaching memory limit',
      );
    });

    test('increment should early return if shouldTrack is false', () => {
      client.shouldTrack = false;
      client.increment('analytics.fileNotFound', 5);
      expect(client.inMemoryCounters).toEqual({});
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

    test('recordHistogram should early return if storage is not supported', () => {
      (DiagnosticsStorage.isSupported as jest.Mock).mockReturnValue(false);
      const client = new DiagnosticsClient(apiKey, mockLogger);

      client.recordHistogram('sr.time', 50);

      expect(client.inMemoryHistograms).toEqual({});
    });

    test('recordHistogram should early return if exceeding memory limit', () => {
      for (let i = 0; i < MAX_MEMORY_STORAGE_COUNT; i++) {
        client.inMemoryHistograms[`histogram${i}`] = {
          count: 1,
          min: i,
          max: i,
          sum: i,
        };
      }

      expect(Object.keys(client.inMemoryHistograms).length).toBe(MAX_MEMORY_STORAGE_COUNT);

      client.recordHistogram('sr.time', 50);

      expect(Object.keys(client.inMemoryHistograms).length).toBe(MAX_MEMORY_STORAGE_COUNT);
      expect(client.inMemoryHistograms['sr.time']).toBeUndefined();
    });

    test('recordHistogram should early return if shouldTrack is false', () => {
      client.shouldTrack = false;
      client.recordHistogram('sr.time', 50);
      expect(client.inMemoryHistograms).toEqual({});
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

    test('recordEvent should early return if storage is not supported', () => {
      (DiagnosticsStorage.isSupported as jest.Mock).mockReturnValue(false);
      const client = new DiagnosticsClient(apiKey, mockLogger);

      client.recordEvent('error', { stack_trace: 'test stack trace' });

      expect(client.inMemoryEvents).toEqual([]);
    });

    test('recordEvent should early return if exceeding memory limit', () => {
      for (let i = 0; i < 10; i++) {
        client.inMemoryEvents.push({
          event_name: `event${i}`,
          time: Date.now(),
          event_properties: { index: i },
        });
      }

      expect(client.inMemoryEvents).toHaveLength(10);

      client.recordEvent('error', { stack_trace: 'test stack trace' });

      expect(client.inMemoryEvents).toHaveLength(10);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsClient: Early return recordEvent as reaching memory limit',
      );
    });

    test('recordEvent should early return if shouldTrack is false', () => {
      client.shouldTrack = false;
      client.recordEvent('error', { stack_trace: 'test stack trace' });
      expect(client.inMemoryEvents).toEqual([]);
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

    test('should early return if storage is not supported', async () => {
      (DiagnosticsStorage.isSupported as jest.Mock).mockReturnValue(false);
      const client = new DiagnosticsClient(apiKey, mockLogger);

      await client.saveAllDataToStorage();

      expect(mockStorage.setTags).not.toHaveBeenCalled();
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

    test('should early return if storage is not supported', async () => {
      (DiagnosticsStorage.isSupported as jest.Mock).mockReturnValue(false);
      const client = new DiagnosticsClient(apiKey, mockLogger);

      await client._flush();

      expect(mockStorage.getAllAndClear).not.toHaveBeenCalled();
    });

    test('should call necessary APIs', async () => {
      const saveAllDataToStorageSpy = jest.spyOn(client, 'saveAllDataToStorage').mockResolvedValue();
      client.flushTimer = setTimeout(() => {
        // Mock timer callback
      }, 1000);

      await client._flush();

      expect(saveAllDataToStorageSpy).toHaveBeenCalled();
      expect(mockStorage.getAllAndClear).toHaveBeenCalled();
      expect(mockStorage.setLastFlushTimestamp).toHaveBeenCalled();
      // Also test histogram calculation
      expect(fetchSpy).toHaveBeenCalledWith({
        tags: EXPECTED_TAGS,
        histogram: EXPECTED_HISTOGRAMS,
        counters: EXPECTED_COUNTERS,
        events: [{ event_name: 'error', time: 123456789, event_properties: { type: 'network' } }],
      });
    });

    test('should early return if all data collections are empty', async () => {
      // Mock storage to return empty data
      const emptyMockStorage = {
        getAllAndClear: jest.fn().mockResolvedValue({
          tags: [],
          counters: [],
          histogramStats: [],
          events: [],
        }),
        setLastFlushTimestamp: jest.fn().mockResolvedValue(undefined),
        setTags: jest.fn().mockResolvedValue(undefined),
        incrementCounters: jest.fn().mockResolvedValue(undefined),
        setHistogramStats: jest.fn().mockResolvedValue(undefined),
        addEventRecords: jest.fn().mockResolvedValue(undefined),
      };

      // Replace the storage with empty mock
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      client.storage = emptyMockStorage as any;

      // Call _flush
      await client._flush();

      // Verify that fetch was NOT called since all collections are empty
      expect(fetchSpy).not.toHaveBeenCalled();

      // Verify that storage methods were still called
      expect(emptyMockStorage.getAllAndClear).toHaveBeenCalled();
      expect(emptyMockStorage.setLastFlushTimestamp).toHaveBeenCalled();
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
      (getGlobalScope as jest.Mock).mockReturnValue(globalThis);
    });

    afterEach(() => {
      mockFetch.mockRestore();
      jest.clearAllMocks();
    });

    test('should early return if fetch is not supported', async () => {
      (getGlobalScope as jest.Mock).mockReturnValue(undefined);
      const client = new DiagnosticsClient(apiKey, mockLogger);

      await client.fetch(TEST_PAYLOAD);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'DiagnosticsClient: Failed to send diagnostics data. ',
        expect.any(Error),
      );
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
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsClient: Failed to send diagnostics data. ', error);
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

  describe('_setSampleRate', () => {
    let client: DiagnosticsClient;
    let mockIsTimestampInSample: jest.SpyInstance;

    beforeEach(() => {
      // Mock isTimestampInSample with realistic implementation: compare sample rate with 0.5
      mockIsTimestampInSample = jest
        .spyOn({ isTimestampInSample }, 'isTimestampInSample')
        .mockImplementation((_timestamp: string | number, sampleRate: number) => {
          return sampleRate >= 0.5;
        });
      client = new DiagnosticsClient(apiKey, mockLogger);
    });

    afterEach(() => {
      mockIsTimestampInSample.mockRestore();
    });

    test('should update sample rate and shouldTrack when rate >= 0.5 and enabled', () => {
      const newSampleRate = 0.8;
      client.config.enabled = true;

      client._setSampleRate(newSampleRate);

      expect(client.config.sampleRate).toBe(newSampleRate);
      expect(mockIsTimestampInSample).toHaveBeenCalledWith(client.startTimestamp, newSampleRate);
      expect(client.shouldTrack).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsClient: Setting sample rate to', newSampleRate);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsClient: Should track is', true);
    });

    test('should update sample rate and set shouldTrack to false when rate < 0.5', () => {
      const newSampleRate = 0.2;
      client.config.enabled = true;

      client._setSampleRate(newSampleRate);

      expect(client.config.sampleRate).toBe(newSampleRate);
      expect(mockIsTimestampInSample).toHaveBeenCalledWith(client.startTimestamp, newSampleRate);
      expect(client.shouldTrack).toBe(false);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsClient: Setting sample rate to', newSampleRate);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsClient: Should track is', false);
    });

    test('should set shouldTrack to false when disabled even with high sample rate', () => {
      const newSampleRate = 1.0;
      client.config.enabled = false;

      client._setSampleRate(newSampleRate);

      expect(client.config.sampleRate).toBe(newSampleRate);
      expect(mockIsTimestampInSample).toHaveBeenCalledWith(client.startTimestamp, newSampleRate);
      expect(client.shouldTrack).toBe(false);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsClient: Setting sample rate to', newSampleRate);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith('DiagnosticsClient: Should track is', false);
    });
  });
});
