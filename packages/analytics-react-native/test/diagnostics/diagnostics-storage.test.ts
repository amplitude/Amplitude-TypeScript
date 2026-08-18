import { ILogger } from '@amplitude/analytics-core';
import { ReactNativeDiagnosticsStorage } from '../../src/diagnostics/diagnostics-storage';
import * as localStorageModule from '../../src/storage/local-storage';

const mockLogger: ILogger = {
  disable: jest.fn(),
  enable: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const apiKey = '1234567890abcdefg';

/** In-memory stand-in for the AsyncStorage module surface we use. */
const createFakeAsyncStorage = () => {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: jest.fn((key: string) => Promise.resolve(entries.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      entries.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      entries.delete(key);
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      entries.clear();
      return Promise.resolve();
    }),
  };
};

describe('ReactNativeDiagnosticsStorage', () => {
  let fakeAsyncStorage: ReturnType<typeof createFakeAsyncStorage>;
  let getAsyncStorageSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    fakeAsyncStorage = createFakeAsyncStorage();
    getAsyncStorageSpy = jest.spyOn(localStorageModule, 'getAsyncStorage').mockReturnValue(fakeAsyncStorage);
  });

  afterEach(() => {
    getAsyncStorageSpy.mockRestore();
  });

  const createStorage = () => new ReactNativeDiagnosticsStorage(apiKey, mockLogger);

  describe('storage key', () => {
    test('should namespace by the first 10 characters of the api key', () => {
      expect(createStorage().storageKey).toBe('AMP_diagnostics_1234567890');
    });
  });

  describe('tags', () => {
    test('should persist and return tags', async () => {
      const storage = createStorage();

      await storage.setTags({ library: 'amplitude-react-native-ts/1.0.0', platform: 'ReactNative' });

      const { tags } = await storage.getAllAndClear();
      expect(tags).toEqual([
        { key: 'library', value: 'amplitude-react-native-ts/1.0.0' },
        { key: 'platform', value: 'ReactNative' },
      ]);
    });

    test('should overwrite an existing tag', async () => {
      const storage = createStorage();

      await storage.setTags({ platform: 'ReactNative' });
      await storage.setTags({ platform: 'Web' });

      const { tags } = await storage.getAllAndClear();
      expect(tags).toEqual([{ key: 'platform', value: 'Web' }]);
    });

    test('should keep tags across getAllAndClear', async () => {
      const storage = createStorage();
      await storage.setTags({ platform: 'ReactNative' });

      await storage.getAllAndClear();
      const { tags } = await storage.getAllAndClear();

      expect(tags).toEqual([{ key: 'platform', value: 'ReactNative' }]);
    });

    test('should no-op on an empty set', async () => {
      const storage = createStorage();

      await storage.setTags({});

      expect(fakeAsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('counters', () => {
    test('should accumulate across calls', async () => {
      const storage = createStorage();

      await storage.incrementCounters({ 'analytics.error': 2 });
      await storage.incrementCounters({ 'analytics.error': 3, 'network.retry': 1 });

      const { counters } = await storage.getAllAndClear();
      expect(counters).toEqual([
        { key: 'analytics.error', value: 5 },
        { key: 'network.retry', value: 1 },
      ]);
    });

    test('should reset on getAllAndClear', async () => {
      const storage = createStorage();
      await storage.incrementCounters({ 'analytics.error': 2 });

      await storage.getAllAndClear();
      const { counters } = await storage.getAllAndClear();

      expect(counters).toEqual([]);
    });

    test('should no-op on an empty set', async () => {
      const storage = createStorage();

      await storage.incrementCounters({});

      expect(fakeAsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('histograms', () => {
    test('should accumulate count and sum and merge min/max', async () => {
      const storage = createStorage();

      await storage.setHistogramStats({ 'sr.time': { count: 1, min: 50, max: 50, sum: 50 } });
      await storage.setHistogramStats({ 'sr.time': { count: 2, min: 10, max: 90, sum: 100 } });

      const { histogramStats } = await storage.getAllAndClear();
      expect(histogramStats).toEqual([{ key: 'sr.time', count: 3, min: 10, max: 90, sum: 150 }]);
    });

    test('should reset on getAllAndClear', async () => {
      const storage = createStorage();
      await storage.setHistogramStats({ 'sr.time': { count: 1, min: 50, max: 50, sum: 50 } });

      await storage.getAllAndClear();
      const { histogramStats } = await storage.getAllAndClear();

      expect(histogramStats).toEqual([]);
    });

    test('should no-op on an empty set', async () => {
      const storage = createStorage();

      await storage.setHistogramStats({});

      expect(fakeAsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('events', () => {
    const event = (name: string) => ({ event_name: name, time: 1, event_properties: {} });

    test('should append event records', async () => {
      const storage = createStorage();

      await storage.addEventRecords([event('a'), event('b')]);

      const { events } = await storage.getAllAndClear();
      expect(events.map((e) => e.event_name)).toEqual(['a', 'b']);
    });

    test('should cap at 10 events and keep the least recent', async () => {
      const storage = createStorage();

      await storage.addEventRecords(Array.from({ length: 12 }, (_, i) => event(`e${i}`)));

      const { events } = await storage.getAllAndClear();
      expect(events).toHaveLength(10);
      expect(events[0].event_name).toBe('e0');
      expect(events[9].event_name).toBe('e9');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'ReactNativeDiagnosticsStorage: Only added 10 of 12 events due to storage limit',
      );
    });

    test('should drop events once full', async () => {
      const storage = createStorage();
      await storage.addEventRecords(Array.from({ length: 10 }, (_, i) => event(`e${i}`)));
      fakeAsyncStorage.setItem.mockClear();

      await storage.addEventRecords([event('overflow')]);

      expect(fakeAsyncStorage.setItem).not.toHaveBeenCalled();
      const { events } = await storage.getAllAndClear();
      expect(events.map((e) => e.event_name)).not.toContain('overflow');
    });

    test('should reset on getAllAndClear', async () => {
      const storage = createStorage();
      await storage.addEventRecords([event('a')]);

      await storage.getAllAndClear();
      const { events } = await storage.getAllAndClear();

      expect(events).toEqual([]);
    });

    test('should no-op on an empty list', async () => {
      const storage = createStorage();

      await storage.addEventRecords([]);

      expect(fakeAsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('last flush timestamp', () => {
    test('should be undefined before it is set', async () => {
      expect(await createStorage().getLastFlushTimestamp()).toBeUndefined();
    });

    test('should round-trip', async () => {
      const storage = createStorage();

      await storage.setLastFlushTimestamp(1700000000000);

      expect(await storage.getLastFlushTimestamp()).toBe(1700000000000);
    });
  });

  describe('persistence', () => {
    test('should hydrate a new instance from the persisted blob', async () => {
      const first = createStorage();
      await first.setTags({ platform: 'ReactNative' });
      await first.incrementCounters({ 'analytics.error': 4 });
      await first.setLastFlushTimestamp(1700000000000);

      const second = createStorage();

      expect(await second.getLastFlushTimestamp()).toBe(1700000000000);
      const { tags, counters } = await second.getAllAndClear();
      expect(tags).toEqual([{ key: 'platform', value: 'ReactNative' }]);
      expect(counters).toEqual([{ key: 'analytics.error', value: 4 }]);
    });

    test('should tolerate a blob written without newer fields', async () => {
      fakeAsyncStorage.entries.set('AMP_diagnostics_1234567890', JSON.stringify({ tags: { a: 'b' } }));

      const storage = createStorage();

      const { tags, counters, histogramStats, events } = await storage.getAllAndClear();
      expect(tags).toEqual([{ key: 'a', value: 'b' }]);
      expect(counters).toEqual([]);
      expect(histogramStats).toEqual([]);
      expect(events).toEqual([]);
    });

    test('should log and start empty on unparsable persisted data', async () => {
      fakeAsyncStorage.entries.set('AMP_diagnostics_1234567890', 'not json');

      const storage = createStorage();

      const { tags } = await storage.getAllAndClear();
      expect(tags).toEqual([]);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'ReactNativeDiagnosticsStorage: Failed to read persisted diagnostics',
        expect.anything(),
      );
    });

    test('should log and keep data in memory when a write fails', async () => {
      const storage = createStorage();
      fakeAsyncStorage.setItem.mockRejectedValueOnce(new Error('native module missing'));

      await storage.incrementCounters({ 'analytics.error': 1 });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'ReactNativeDiagnosticsStorage: Failed to persist diagnostics',
        expect.anything(),
      );
      const { counters } = await storage.getAllAndClear();
      expect(counters).toEqual([{ key: 'analytics.error', value: 1 }]);
    });

    test('should serialize concurrent writes without losing data', async () => {
      const storage = createStorage();

      await Promise.all([
        storage.incrementCounters({ a: 1 }),
        storage.incrementCounters({ b: 2 }),
        storage.setTags({ t: 'v' }),
        storage.addEventRecords([{ event_name: 'e', time: 1, event_properties: {} }]),
      ]);

      const persisted = JSON.parse(fakeAsyncStorage.entries.get('AMP_diagnostics_1234567890') as string) as {
        counters: Record<string, number>;
        tags: Record<string, string>;
        events: unknown[];
      };
      expect(persisted.counters).toEqual({ a: 1, b: 2 });
      expect(persisted.tags).toEqual({ t: 'v' });
      expect(persisted.events).toHaveLength(1);
    });
  });

  describe('without AsyncStorage installed', () => {
    beforeEach(() => {
      getAsyncStorageSpy.mockReturnValue(null);
    });

    test('should keep data in memory and never throw', async () => {
      const storage = createStorage();

      await storage.setTags({ platform: 'ReactNative' });
      await storage.incrementCounters({ 'analytics.error': 2 });
      await storage.setHistogramStats({ 'sr.time': { count: 1, min: 5, max: 5, sum: 5 } });
      await storage.addEventRecords([{ event_name: 'e', time: 1, event_properties: {} }]);
      await storage.setLastFlushTimestamp(42);

      expect(await storage.getLastFlushTimestamp()).toBe(42);
      const { tags, counters, histogramStats, events } = await storage.getAllAndClear();
      expect(tags).toEqual([{ key: 'platform', value: 'ReactNative' }]);
      expect(counters).toEqual([{ key: 'analytics.error', value: 2 }]);
      expect(histogramStats).toEqual([{ key: 'sr.time', count: 1, min: 5, max: 5, sum: 5 }]);
      expect(events).toHaveLength(1);
    });

    test('should not share data between instances', async () => {
      const first = createStorage();
      await first.incrementCounters({ 'analytics.error': 1 });

      const { counters } = await createStorage().getAllAndClear();

      expect(counters).toEqual([]);
    });
  });

  describe('key limits', () => {
    // Exercises the cap that keeps the single AsyncStorage entry bounded.
    const overLimit = (prefix: string) =>
      Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`${prefix}${i}`, 1]));

    test('should stop adding new counter keys at the limit but keep updating known ones', async () => {
      const storage = createStorage();

      await storage.incrementCounters(overLimit('c'));
      await storage.incrementCounters({ c0: 5, 'brand.new': 1 });

      const { counters } = await storage.getAllAndClear();
      expect(counters).toHaveLength(1000);
      expect(counters.find((c) => c.key === 'c0')?.value).toBe(6);
      expect(counters.find((c) => c.key === 'brand.new')).toBeUndefined();
    });

    test('should cap tag keys', async () => {
      const storage = createStorage();

      await storage.setTags(
        Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`t${i}`, 'v'])) as Record<string, string>,
      );

      const { tags } = await storage.getAllAndClear();
      expect(tags).toHaveLength(1000);
    });

    test('should cap histogram keys', async () => {
      const storage = createStorage();

      await storage.setHistogramStats(
        Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`h${i}`, { count: 1, min: 1, max: 1, sum: 1 }])),
      );

      const { histogramStats } = await storage.getAllAndClear();
      expect(histogramStats).toHaveLength(1000);
    });
  });
});
