import { Logger } from '@amplitude/analytics-types';
import * as IDB from 'idb';
import { IDBPDatabase } from 'idb';
import * as RemoteConfigAPIStore from '../src/remote-config-idb-store';
import { RemoteConfigDB } from '../src/remote-config-idb-store';
import { ConfigNamespace, RemoteConfigAPIResponse } from '../src/types';

jest.mock('idb-keyval');

type MockedLogger = jest.Mocked<Logger>;

const apiKey = 'static_key';

const samplingConfig = {
  sample_rate: 1,
  capture_enabled: true,
};
const mockRemoteConfig: RemoteConfigAPIResponse = {
  configs: {
    sessionReplay: {
      sr_sampling_config: samplingConfig,
    },
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
  let putMock: jest.Mock;
  let mockDB: IDBPDatabase<RemoteConfigAPIStore.RemoteConfigDB>;
  beforeEach(() => {
    putMock = jest.fn();
    mockDB = {
      get: jest.fn().mockImplementation(async (objectStoreName) => {
        if (objectStoreName === 'lastFetchedSessionId') {
          return 123;
        }
        return mockRemoteConfig;
      }),
      put: putMock,
    } as unknown as IDBPDatabase<RemoteConfigAPIStore.RemoteConfigDB>;
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  describe('init', () => {
    test('should create a store with the api key in the name', async () => {
      jest.spyOn(RemoteConfigAPIStore, 'createStore').mockResolvedValueOnce(mockDB);
      await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
      });
      expect(RemoteConfigAPIStore.createStore).toHaveBeenCalledWith('static_key_amp_config');
    });
  });

  describe('getRemoteConfig', () => {
    test('should return the remote config from idb store', async () => {
      jest.spyOn(RemoteConfigAPIStore, 'createStore').mockResolvedValueOnce(mockDB);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
      });
      const remoteConfig = await store.getRemoteConfig(ConfigNamespace.SESSION_REPLAY, 'sr_sampling_config');
      expect(remoteConfig).toEqual(mockRemoteConfig);
    });
    test('should handle an undefined store', async () => {
      mockDB.get = jest.fn().mockResolvedValue(undefined);
      jest.spyOn(RemoteConfigAPIStore, 'createStore').mockResolvedValueOnce(mockDB);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
      });
      const remoteConfig = await store.getRemoteConfig(ConfigNamespace.SESSION_REPLAY, 'sr_sampling_config');
      expect(remoteConfig).toEqual(undefined);
    });
    test('should catch errors', async () => {
      mockDB.get = jest.fn().mockImplementationOnce(() => Promise.reject('error'));
      jest.spyOn(RemoteConfigAPIStore, 'createStore').mockResolvedValueOnce(mockDB);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
      });
      await store.getRemoteConfig(ConfigNamespace.SESSION_REPLAY, 'sr_sampling_config');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual('Failed to fetch remote config: error');
    });
  });

  describe('getLastFetchedSessionId', () => {
    test('should return the last fetched session id from idb store', async () => {
      jest.spyOn(RemoteConfigAPIStore, 'createStore').mockResolvedValueOnce(mockDB);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
      });
      const lastFetchedSessionId = await store.getLastFetchedSessionId();
      expect(lastFetchedSessionId).toEqual(123);
    });
    test('should catch errors', async () => {
      mockDB.get = jest.fn().mockImplementationOnce(() => Promise.reject('error'));
      jest.spyOn(RemoteConfigAPIStore, 'createStore').mockResolvedValueOnce(mockDB);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
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
      jest.spyOn(RemoteConfigAPIStore, 'createStore').mockResolvedValueOnce(mockDB);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
      });
      await store.storeRemoteConfig(mockRemoteConfig, 456);

      expect(putMock).toHaveBeenCalledTimes(2);
      expect(putMock).toHaveBeenCalledWith('lastFetchedSessionId', 456, 'sessionId');
      expect(putMock).toHaveBeenCalledWith(
        ConfigNamespace.SESSION_REPLAY,
        mockRemoteConfig.configs[ConfigNamespace.SESSION_REPLAY],
      );
    });

    test('should handle undefined session id', async () => {
      jest.spyOn(RemoteConfigAPIStore, 'createStore').mockResolvedValueOnce(mockDB);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
      });
      await store.storeRemoteConfig(mockRemoteConfig);

      expect(putMock).toHaveBeenCalledTimes(1);
      expect(putMock).toHaveBeenCalledWith(
        ConfigNamespace.SESSION_REPLAY,
        mockRemoteConfig.configs[ConfigNamespace.SESSION_REPLAY],
      );
    });
    test('should catch errors', async () => {
      mockDB.put = jest.fn().mockImplementationOnce(() => Promise.reject('error'));
      jest.spyOn(RemoteConfigAPIStore, 'createStore').mockResolvedValueOnce(mockDB);
      const store = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
        apiKey,
        loggerProvider: mockLoggerProvider,
      });
      await store.storeRemoteConfig(mockRemoteConfig, 123);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual('Failed to store remote config: error');
    });
  });

  describe('createStore', () => {
    let createObjectStoreMock: jest.Mock;
    beforeEach(() => {
      createObjectStoreMock = jest.fn();
      const mockDB = {
        objectStoreNames: {
          contains: () => false,
        },
        createObjectStore: createObjectStoreMock,
      } as unknown as IDBPDatabase<RemoteConfigDB>;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      jest.spyOn(IDB, 'openDB').mockImplementation(async (_dbName, _version, callbacks) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method
        const upgrade = callbacks?.upgrade as CallableFunction;
        upgrade(mockDB);
        return Promise.resolve(mockDB);
      });
    });
    test('should create an object store for session replay', async () => {
      await RemoteConfigAPIStore.createStore('myDB');
      expect(createObjectStoreMock).toHaveBeenCalledWith(ConfigNamespace.SESSION_REPLAY);
    });

    test('should create an object store for lastFetchedSessionId', async () => {
      await RemoteConfigAPIStore.createStore('myDB');
      expect(createObjectStoreMock).toHaveBeenCalledWith('lastFetchedSessionId');
    });
  });
});
