import { Logger } from '@amplitude/analytics-types';
import * as IDB from 'idb';
import { IDBPDatabase } from 'idb';
import * as RemoteConfigAPIStore from '../src/remote-config-idb-store';
import { RemoteConfigAPIResponse } from '../src/types';

jest.mock('idb-keyval');

type MockedLogger = jest.Mocked<Logger>;

const apiKey = 'static_key';

const samplingConfig = {
  sr_sampling_config: {
    sample_rate: 1,
    capture_enabled: true,
  },
};
const mockRemoteConfig: RemoteConfigAPIResponse<typeof samplingConfig> = {
  configs: {
    sessionReplay: samplingConfig,
  },
};

describe('RemoteConfigIDBStore', () => {
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  let putMockRemoteConfigDB: jest.Mock;
  let putMockMetaDB: jest.Mock;
  let mockRemoteConfigDB: IDBPDatabase<unknown>;
  let mockMetaDB: IDBPDatabase<RemoteConfigAPIStore.MetaDB>;
  beforeEach(() => {
    putMockRemoteConfigDB = jest.fn();
    putMockMetaDB = jest.fn();
    mockRemoteConfigDB = {
      get: jest.fn().mockImplementation(async () => mockRemoteConfig),
      put: putMockRemoteConfigDB,
    } as unknown as IDBPDatabase<unknown>;
    mockMetaDB = {
      get: jest.fn().mockImplementation(async () => undefined),
      put: putMockMetaDB,
    } as unknown as IDBPDatabase<RemoteConfigAPIStore.MetaDB>;
    jest.spyOn(RemoteConfigAPIStore, 'openOrCreateMetaStore').mockResolvedValue(mockMetaDB);
    jest.spyOn(RemoteConfigAPIStore, 'openOrCreateRemoteConfigStore').mockResolvedValue(mockRemoteConfigDB);
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  describe('init', () => {
    test('should create a remote config and meta stores', async () => {
      await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      expect(RemoteConfigAPIStore.openOrCreateRemoteConfigStore).toHaveBeenCalledWith('static_key_amp_config', [
        'sessionReplay',
      ]);
      expect(RemoteConfigAPIStore.openOrCreateMetaStore).toHaveBeenCalledWith('static_key_amp_config_meta');
    });

    test('should delete store and recreate if lastFetchedSessionId is older than MAX_IDB_STORAGE_TIME', async () => {
      jest.spyOn(IDB, 'deleteDB').mockResolvedValue();
      const sessionIdTimestamp = new Date('2023-07-27 08:30:00').getTime();
      const currentTime = new Date('2023-07-31 08:30:00').getTime(); // 4 days ahead
      jest.useFakeTimers().setSystemTime(currentTime);
      mockMetaDB.get = jest.fn().mockResolvedValue(sessionIdTimestamp);

      await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      expect(IDB.deleteDB).toHaveBeenCalledWith('static_key_amp_config');
      expect(RemoteConfigAPIStore.openOrCreateRemoteConfigStore).toHaveBeenCalledWith('static_key_amp_config', [
        'sessionReplay',
      ]);
    });
  });

  describe('getRemoteConfig', () => {
    test('should return the remote config from idb store', async () => {
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      const remoteConfig = await store.getRemoteConfig('sessionReplay', 'sr_sampling_config');
      expect(remoteConfig).toEqual(mockRemoteConfig);
    });
    test('should handle an undefined store', async () => {
      mockRemoteConfigDB.get = jest.fn().mockResolvedValue(undefined);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      const remoteConfig = await store.getRemoteConfig('sessionReplay', 'sr_sampling_config');
      expect(remoteConfig).toEqual(undefined);
    });
    test('should catch errors', async () => {
      mockRemoteConfigDB.get = jest.fn().mockImplementationOnce(() => Promise.reject('error'));
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      await store.getRemoteConfig('sessionReplay', 'sr_sampling_config');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual('Failed to fetch remote config: error');
    });
  });

  describe('getLastFetchedSessionId', () => {
    const sessionIdTimestamp = new Date('2023-07-31 08:30:00').getTime();
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(sessionIdTimestamp);
    });
    test('should return the last fetched session id from idb store', async () => {
      mockMetaDB.get = jest.fn().mockResolvedValue(sessionIdTimestamp);
      jest.spyOn(RemoteConfigAPIStore, 'openOrCreateMetaStore').mockResolvedValueOnce(mockMetaDB);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      const lastFetchedSessionId = await store.getLastFetchedSessionId();
      expect(lastFetchedSessionId).toEqual(sessionIdTimestamp);
    });
    test('should catch errors', async () => {
      mockMetaDB.get = jest
        .fn()
        .mockResolvedValueOnce(sessionIdTimestamp)
        .mockImplementationOnce(() => Promise.reject('error'));
      jest.spyOn(RemoteConfigAPIStore, 'openOrCreateMetaStore').mockResolvedValueOnce(mockMetaDB);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      await store.getLastFetchedSessionId();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual('Failed to fetch lastFetchedSessionId: error');
    });
  });

  describe('storeRemoteConfig', () => {
    test('should store the last fetched session id and the remote config', async () => {
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      await store.storeRemoteConfig(mockRemoteConfig, 456);

      expect(putMockMetaDB).toHaveBeenCalledWith('lastFetchedSessionId', 456, 'sessionId');
      expect(putMockRemoteConfigDB).toHaveBeenCalledWith(
        'sessionReplay',
        mockRemoteConfig.configs['sessionReplay'].sr_sampling_config,
        'sr_sampling_config',
      );
    });

    test('should handle undefined session id', async () => {
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      await store.storeRemoteConfig(mockRemoteConfig);

      expect(putMockMetaDB).not.toHaveBeenCalled();
      expect(putMockRemoteConfigDB).toHaveBeenCalledWith(
        'sessionReplay',
        mockRemoteConfig.configs['sessionReplay'].sr_sampling_config,
        'sr_sampling_config',
      );
    });
    test('should catch errors', async () => {
      mockRemoteConfigDB.put = jest.fn().mockImplementationOnce(() => Promise.reject('error'));
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      await store.storeRemoteConfig(mockRemoteConfig, 123);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual('Failed to store remote config: error');
    });
  });
  describe('stores', () => {
    let createObjectStoreMock: jest.Mock;
    beforeEach(() => {
      jest.spyOn(RemoteConfigAPIStore, 'openOrCreateMetaStore').mockRestore();
      jest.spyOn(RemoteConfigAPIStore, 'openOrCreateRemoteConfigStore').mockRestore();
      createObjectStoreMock = jest.fn();
      const mockDB = {
        objectStoreNames: {
          contains: () => false,
        },
        createObjectStore: createObjectStoreMock,
      } as unknown as IDBPDatabase<unknown>;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      jest.spyOn(IDB, 'openDB').mockImplementation(async (_dbName, _version, callbacks) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method
        const upgrade = callbacks?.upgrade as CallableFunction;
        upgrade(mockDB);
        return Promise.resolve(mockDB);
      });
    });

    describe('openOrCreateRemoteConfigStore', () => {
      test('should create a remote config db', async () => {
        await RemoteConfigAPIStore.openOrCreateRemoteConfigStore('myDB', ['sessionReplay']);
        expect(IDB.openDB).toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect((IDB.openDB as jest.Mock).mock.calls[0][0]).toBe('myDB');
      });
      test('should create an object store for session replay', async () => {
        await RemoteConfigAPIStore.openOrCreateRemoteConfigStore('myDB', ['sessionReplay']);
        expect(createObjectStoreMock).toHaveBeenCalledWith('sessionReplay');
      });
    });
    describe('openOrCreateMetaStore', () => {
      test('should create a meta db', async () => {
        await RemoteConfigAPIStore.openOrCreateMetaStore('myDB');
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect((IDB.openDB as jest.Mock).mock.calls[0][0]).toBe('myDB');
      });
      test('should create an object store for lastFetchedSessionId', async () => {
        await RemoteConfigAPIStore.openOrCreateMetaStore('myDB');
        expect(createObjectStoreMock).toHaveBeenCalledWith('lastFetchedSessionId');
      });
    });
  });
});
