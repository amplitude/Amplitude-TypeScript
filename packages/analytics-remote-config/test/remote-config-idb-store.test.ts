/* eslint-disable @typescript-eslint/unbound-method */
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
const mockRemoteConfigAPIResponse: RemoteConfigAPIResponse<typeof samplingConfig> = {
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
  let remoteConfigStore: IDBPDatabase<unknown>;
  let metaStore: IDBPDatabase<RemoteConfigAPIStore.MetaDB>;
  let remoteConfigOpenOrCreateMock: jest.SpyInstance;
  beforeEach(async () => {
    jest.spyOn(RemoteConfigAPIStore, 'openOrCreateMetaStore');
    remoteConfigOpenOrCreateMock = jest.spyOn(RemoteConfigAPIStore, 'openOrCreateRemoteConfigStore');
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
      metaStore = await RemoteConfigAPIStore.openOrCreateMetaStore('static_key_amp_config_meta');
      await metaStore.put('lastFetchedSessionId', sessionIdTimestamp, 'sessionId');

      await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      expect(IDB.deleteDB).toHaveBeenCalledWith('static_key_amp_config');
      expect(RemoteConfigAPIStore.openOrCreateRemoteConfigStore).toHaveBeenCalledTimes(2);
      expect(RemoteConfigAPIStore.openOrCreateRemoteConfigStore).toHaveBeenLastCalledWith('static_key_amp_config', [
        'sessionReplay',
      ]);
    });
    test('should setup object stores', async () => {
      await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      const remoteConfigDb = (await remoteConfigOpenOrCreateMock.mock.results[0].value) as IDBPDatabase<any>;
      const objStoreNames = remoteConfigDb.objectStoreNames;
      console.log('remoteConfigDb', remoteConfigDb, objStoreNames);
      // remoteConfigDb
      //   .expect(RemoteConfigAPIStore.openOrCreateRemoteConfigStore)
      //   .toHaveBeenCalledWith('static_key_amp_config', ['sessionReplay']);
      expect(remoteConfigDb.objectStoreNames).toEqual(['sessionReplay']);
    });
    test.only('should setup multiple object stores if create called more than once with different configKeys', async () => {
      await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['analyticsSDK'],
      });
      console.log('after create');
      const remoteConfigDb = (await remoteConfigOpenOrCreateMock.mock.results[1].value) as IDBPDatabase<any>;
      console.log('remoteConfigDb', remoteConfigDb);
      // remoteConfigDb
      //   .expect(RemoteConfigAPIStore.openOrCreateRemoteConfigStore)
      //   .toHaveBeenCalledWith('static_key_amp_config', ['sessionReplay']);
      expect(remoteConfigDb.objectStoreNames.contains('sessionReplay')).toBe(true);
      expect(remoteConfigDb.objectStoreNames.contains('analyticsSDK')).toBe(true);
    });
  });

  describe('getRemoteConfig', () => {
    beforeEach(async () => {
      remoteConfigStore = await RemoteConfigAPIStore.openOrCreateRemoteConfigStore(
        'static_key_amp_config',
        ['sessionReplay'],
        1,
      );
      metaStore = await RemoteConfigAPIStore.openOrCreateMetaStore('static_key_amp_config_meta');
    });
    test('should return the remote config from idb store', async () => {
      await remoteConfigStore.put('sessionReplay', samplingConfig.sr_sampling_config, 'sr_sampling_config');
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      const remoteConfig = await store.getRemoteConfig('sessionReplay', 'sr_sampling_config');
      expect(remoteConfig).toEqual(samplingConfig.sr_sampling_config);
    });
    test('should handle an undefined store', async () => {
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      const remoteConfig = await store.getRemoteConfig('sessionReplay', 'sr_sampling_config');
      expect(remoteConfig).toEqual(undefined);
    });
    test('should catch errors', async () => {
      const mockDB: IDBPDatabase<unknown> = {
        get: jest.fn().mockImplementation(() => Promise.reject('get error')),
      } as unknown as IDBPDatabase<unknown>;
      jest.spyOn(RemoteConfigAPIStore, 'openOrCreateRemoteConfigStore').mockResolvedValue(mockDB);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      await store.getRemoteConfig('sessionReplay', 'sr_sampling_config');
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual('Failed to fetch remote config: get error');
    });
  });

  describe('remoteConfigHasValues', () => {
    beforeEach(async () => {
      remoteConfigStore = await RemoteConfigAPIStore.openOrCreateRemoteConfigStore(
        'static_key_amp_config',
        ['sessionReplay'],
        1,
      );
      metaStore = await RemoteConfigAPIStore.openOrCreateMetaStore('static_key_amp_config_meta');
    });
    test('should return true if remote config is in idb store', async () => {
      await remoteConfigStore.put('sessionReplay', samplingConfig.sr_sampling_config, 'sr_sampling_config');
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      const remoteConfigHasValues = await store.remoteConfigHasValues('sessionReplay');
      expect(remoteConfigHasValues).toEqual(true);
    });
    test('should return false if remote config is not in idb store', async () => {
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      const remoteConfigHasValues = await store.remoteConfigHasValues('sessionReplay');
      expect(remoteConfigHasValues).toEqual(false);
    });
    test('should handle an undefined store', async () => {
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      const remoteConfigHasValues = await store.remoteConfigHasValues('sessionReplay');
      expect(remoteConfigHasValues).toEqual(false);
    });
    test('should catch errors', async () => {
      const mockDB: IDBPDatabase<unknown> = {
        getAll: jest.fn().mockImplementation(() => Promise.reject('get error')),
      } as unknown as IDBPDatabase<unknown>;
      jest.spyOn(RemoteConfigAPIStore, 'openOrCreateRemoteConfigStore').mockResolvedValue(mockDB);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      await store.remoteConfigHasValues('sessionReplay');
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual('Failed to fetch remote config: get error');
    });
  });

  describe('getLastFetchedSessionId', () => {
    beforeEach(async () => {
      remoteConfigStore = await RemoteConfigAPIStore.openOrCreateRemoteConfigStore(
        'static_key_amp_config',
        ['sessionReplay'],
        1,
      );
      metaStore = await RemoteConfigAPIStore.openOrCreateMetaStore('static_key_amp_config_meta');
    });
    const sessionIdTimestamp = new Date('2023-07-31 08:30:00').getTime();
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(sessionIdTimestamp);
    });
    test('should return the last fetched session id from idb store', async () => {
      await metaStore.put('lastFetchedSessionId', sessionIdTimestamp, 'sessionId');
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      const lastFetchedSessionId = await store.getLastFetchedSessionId();
      expect(lastFetchedSessionId).toEqual(sessionIdTimestamp);
    });
    test('should catch errors', async () => {
      const mockDB: IDBPDatabase<RemoteConfigAPIStore.MetaDB> = {
        get: jest.fn().mockImplementation(() => Promise.reject('get error')),
      } as unknown as IDBPDatabase<RemoteConfigAPIStore.MetaDB>;
      jest.spyOn(RemoteConfigAPIStore, 'openOrCreateMetaStore').mockResolvedValue(mockDB);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      await store.getLastFetchedSessionId();
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(2);
      expect(mockLoggerProvider.warn.mock.calls[1][0]).toEqual('Failed to fetch lastFetchedSessionId: get error');
    });
  });

  describe('storeRemoteConfig', () => {
    beforeEach(async () => {
      remoteConfigStore = await RemoteConfigAPIStore.openOrCreateRemoteConfigStore(
        'static_key_amp_config',
        ['sessionReplay'],
        1,
      );
      metaStore = await RemoteConfigAPIStore.openOrCreateMetaStore('static_key_amp_config_meta');
    });
    test('should store the last fetched session id and the remote config', async () => {
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      await store.storeRemoteConfig(mockRemoteConfigAPIResponse, 456);
      const lastFetchedSessionId = await metaStore.get('lastFetchedSessionId', 'sessionId');
      expect(lastFetchedSessionId).toBe(456);
      const storedConfigKeys = await remoteConfigStore.getAllKeys('sessionReplay');
      expect(storedConfigKeys).toEqual(['sr_sampling_config']);
      const storedConfig = await remoteConfigStore.getAll('sessionReplay');
      expect(storedConfig[0]).toEqual(mockRemoteConfigAPIResponse.configs['sessionReplay'].sr_sampling_config);
    });

    test('should handle undefined session id', async () => {
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      await store.storeRemoteConfig(mockRemoteConfigAPIResponse);

      const lastFetchedSessionId = await metaStore.get('lastFetchedSessionId', 'sessionId');
      expect(lastFetchedSessionId).toBe(undefined);
      const storedConfigKeys = await remoteConfigStore.getAllKeys('sessionReplay');
      expect(storedConfigKeys).toEqual(['sr_sampling_config']);
      const storedConfig = await remoteConfigStore.getAll('sessionReplay');
      expect(storedConfig[0]).toEqual(mockRemoteConfigAPIResponse.configs['sessionReplay'].sr_sampling_config);
    });
    test('should catch errors', async () => {
      const mockDB: IDBPDatabase<unknown> = {
        transaction: jest.fn().mockImplementation(() => {
          throw new Error('transaction error');
        }),
      } as unknown as IDBPDatabase<unknown>;
      jest.spyOn(RemoteConfigAPIStore, 'openOrCreateRemoteConfigStore').mockResolvedValue(mockDB);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
        configKeys: ['sessionReplay'],
      });
      await store.storeRemoteConfig(mockRemoteConfigAPIResponse, 123);

      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(
        'Failed to store remote config: Error: transaction error',
      );
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
        await RemoteConfigAPIStore.openOrCreateRemoteConfigStore('myDB', ['sessionReplay'], 1);
        expect(IDB.openDB).toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect((IDB.openDB as jest.Mock).mock.calls[0][0]).toBe('myDB');
      });
      test('should create an object store for session replay', async () => {
        await RemoteConfigAPIStore.openOrCreateRemoteConfigStore('myDB', ['sessionReplay'], 1);
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
