import {
  CallbackInfo,
  DeliveryMode,
  EU_SERVER_URL,
  RemoteConfigClient,
  RemoteConfigInfo,
  US_SERVER_URL,
} from '../../src/remote-config/remote-config';
import { ILogger } from '../../src/logger';
import { RemoteConfigLocalStorage } from '../../src/remote-config/remote-config-localstorage';

jest.mock('../../src/remote-config/remote-config-localstorage');
const mockUuid = 'uuid123456789';
jest.mock('../../src/utils/uuid', () => ({
  __esModule: true, // This is important for ES modules
  UUID: jest.fn(() => mockUuid),
}));
jest.mock('../../src/remote-config/remote-config', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const actual = jest.requireActual('../../src/remote-config/remote-config');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    ...actual,
    FETCHED_KEYS: ['test_key_1', 'test_key_2'],
  };
});

const mockLogger: ILogger = {
  disable: jest.fn(),
  enable: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
const mockStorage = {
  fetchConfig: jest.fn(),
  setConfig: jest.fn(),
};
const mockApiKey = 'test-api-key';
const testKey = 'browser';

describe('RemoteConfigClient', () => {
  let client: RemoteConfigClient;
  let loggerDebug: jest.SpyInstance;
  let storageFetchConfig: jest.SpyInstance;

  beforeEach(() => {
    loggerDebug = jest.spyOn(mockLogger, 'debug');
    storageFetchConfig = jest.spyOn(mockStorage, 'fetchConfig');

    (RemoteConfigLocalStorage as jest.Mock).mockImplementation(() => mockStorage);
    client = new RemoteConfigClient(mockApiKey, mockLogger);

    // Clears only the call history but keeps the original mock implementation
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize correctly', () => {
      expect(client.serverUrl).toBe(US_SERVER_URL);
      expect(client.apiKey).toBe(mockApiKey);
      expect(client.logger).toBeDefined();
      expect(client.storage).toBeDefined();

      const usClient = new RemoteConfigClient(mockApiKey, mockLogger, 'US');
      expect(usClient.serverUrl).toBe(US_SERVER_URL);

      const euClient = new RemoteConfigClient(mockApiKey, mockLogger, 'EU');
      expect(euClient.serverUrl).toBe(EU_SERVER_URL);
    });
  });

  describe('subscribe', () => {
    test('should set callback info and call subscribeAll', async () => {
      const subscribeAll = jest.spyOn(client, 'subscribeAll');
      subscribeAll.mockImplementation(jest.fn());
      const callback = jest.fn();
      const callbackInfo = {
        id: mockUuid,
        key: testKey,
        deliveryMode: 'all',
        callback: callback,
      };

      expect(client.callbackInfos.length).toBe(0);
      client.subscribe(testKey, 'all', callback);
      expect(client.callbackInfos.length).toBe(1);
      expect(client.callbackInfos[0]).toEqual(callbackInfo);
      expect(subscribeAll).toHaveBeenCalledTimes(1);
      expect(subscribeAll).toHaveBeenCalledWith(callbackInfo);
    });

    test('should set callback info and call subscribeWaitForRemote', async () => {
      const subscribeWaitForRemote = jest.spyOn(client, 'subscribeWaitForRemote');
      subscribeWaitForRemote.mockImplementation(jest.fn());
      const timeout = 5000;
      const callback = jest.fn();
      const callbackInfo = {
        id: mockUuid,
        key: testKey,
        deliveryMode: { timeout: timeout },
        callback: callback,
      };

      expect(client.callbackInfos.length).toBe(0);
      client.subscribe(testKey, { timeout: timeout }, callback);
      expect(client.callbackInfos.length).toBe(1);
      expect(client.callbackInfos[0]).toEqual(callbackInfo);
      expect(subscribeWaitForRemote).toHaveBeenCalledTimes(1);
      expect(subscribeWaitForRemote).toHaveBeenCalledWith(callbackInfo, timeout);
    });
  });

  describe('unsubscribe', () => {
    test('should remove callback', () => {
      const callbackInfo = {
        id: mockUuid,
        key: testKey,
        deliveryMode: 'all' as DeliveryMode,
        callback: jest.fn(),
      };
      client.callbackInfos.push(callbackInfo);

      expect(client.callbackInfos.length).toBe(1);
      const result = client.unsubscribe(mockUuid);
      expect(client.callbackInfos.length).toBe(0);
      expect(loggerDebug).toHaveBeenCalledWith(
        `Remote config client unsubscribe succeeded removing callback with id ${mockUuid}.`,
      );
      expect(result).toBe(true);
    });

    test('should log when id does not exit', () => {
      const callbackInfo = {
        id: mockUuid,
        key: testKey,
        deliveryMode: 'all' as DeliveryMode,
        callback: jest.fn(),
      };
      client.callbackInfos.push(callbackInfo);

      expect(client.callbackInfos.length).toBe(1);
      const testId = 'id-does-not-exist';
      const result = client.unsubscribe(testId);
      expect(client.callbackInfos.length).toBe(1);
      expect(loggerDebug).toHaveBeenCalledWith(
        `Remote config client unsubscribe failed because callback with id ${testId} doesn't exist.`,
      );
      expect(result).toBe(false);
    });
  });

  describe('updateConfigs', () => {
    test('should call fetch, storage set, and call callbacks', async () => {
      const fetch = jest.spyOn(client, 'fetch');
      const sendCallback = jest.spyOn(client, 'sendCallback');
      const remoteConfigInfo = {
        remoteConfig: null,
        lastFetch: new Date(),
      };
      const fetchPromise = Promise.resolve(remoteConfigInfo);
      fetch.mockReturnValueOnce(fetchPromise);

      const callbackInfo = {
        id: mockUuid,
        key: testKey,
        deliveryMode: 'all' as DeliveryMode,
        callback: jest.fn(),
      };
      client.callbackInfos.push(callbackInfo);

      await client.updateConfigs();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mockStorage.setConfig).toHaveBeenCalledWith(remoteConfigInfo);
      expect(sendCallback).toHaveBeenCalledWith(callbackInfo, remoteConfigInfo, 'remote');
    });
  });

  describe('subscribeAll', () => {
    test('should return remote only if remote returns first', async () => {
      // fetch() returns immediately
      const fetch = jest.spyOn(client, 'fetch');
      const sendCallback = jest.spyOn(client, 'sendCallback');
      const remoteConfigInfo = {
        remoteConfig: null,
        lastFetch: new Date(),
      };
      const fetchPromise = Promise.resolve(remoteConfigInfo);
      fetch.mockReturnValueOnce(fetchPromise);

      // storage.fetchConfig() returns after 1s
      storageFetchConfig.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(remoteConfigInfo);
            }, 1000);
          }),
      );

      const callbackInfo = {
        id: mockUuid,
        key: testKey,
        deliveryMode: 'all' as DeliveryMode,
        callback: jest.fn(),
      };
      await client.subscribeAll(callbackInfo);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mockStorage.fetchConfig).toHaveBeenCalledTimes(1);
      expect(loggerDebug).toHaveBeenCalledWith('Remote config client subscription all mode fetched from remote.');
      expect(sendCallback).toHaveBeenCalledWith(callbackInfo, remoteConfigInfo, 'remote');
      expect(mockStorage.setConfig).toHaveBeenCalledWith(remoteConfigInfo);
    });

    test('should return cache and then remote if cache returns first', async () => {
      // fetch() returns after 1s
      const fetch = jest.spyOn(client, 'fetch');
      const sendCallback = jest.spyOn(client, 'sendCallback');
      const remoteConfigInfo = {
        remoteConfig: null,
        lastFetch: new Date(),
      };
      fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(remoteConfigInfo);
            }, 1000);
          }),
      );

      // storage.fetchConfig() returns immediately
      storageFetchConfig.mockReturnValueOnce(Promise.resolve(remoteConfigInfo));

      const callbackInfo = {
        id: mockUuid,
        key: testKey,
        deliveryMode: 'all' as DeliveryMode,
        callback: jest.fn(),
      };
      await client.subscribeAll(callbackInfo);
      // Wait 1s for fetch() returns
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mockStorage.fetchConfig).toHaveBeenCalledTimes(1);
      expect(loggerDebug).toHaveBeenCalledWith('Remote config client subscription all mode fetched from cache.');
      expect(loggerDebug).toHaveBeenCalledWith('Remote config client subscription all mode fetched from remote.');
      expect(sendCallback).toHaveBeenCalledWith(callbackInfo, remoteConfigInfo, 'remote');
      expect(sendCallback).toHaveBeenCalledWith(callbackInfo, remoteConfigInfo, 'cache');
      expect(mockStorage.setConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeWaitForRemote', () => {
    test('should return remote', async () => {
      // fetch() returns immediately
      const fetch = jest.spyOn(client, 'fetch');
      const sendCallback = jest.spyOn(client, 'sendCallback');
      const remoteConfigInfo = {
        remoteConfig: null,
        lastFetch: new Date(),
      };
      fetch.mockReturnValueOnce(Promise.resolve(remoteConfigInfo));

      const callbackInfo = {
        id: mockUuid,
        key: testKey,
        deliveryMode: 'all' as DeliveryMode,
        callback: jest.fn(),
      };
      await client.subscribeWaitForRemote(callbackInfo, 1000);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(loggerDebug).toHaveBeenCalledWith(
        'Remote config client subscription wait for remote mode returns from remote.',
      );
      expect(sendCallback).toHaveBeenCalledWith(callbackInfo, remoteConfigInfo, 'remote');
    });

    test('should return cache if remote fetch exceed timeout', async () => {
      // fetch() returns in 1.5s
      const fetch = jest.spyOn(client, 'fetch');
      const sendCallback = jest.spyOn(client, 'sendCallback');
      const remoteConfigInfo = {
        remoteConfig: { a: { b: 1 } },
        lastFetch: new Date(),
      };
      fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(remoteConfigInfo);
            }, 1500);
          }),
      );

      // storage.fetchConfig() returns immediately
      storageFetchConfig.mockReturnValueOnce(Promise.resolve(remoteConfigInfo));

      const callbackInfo = {
        id: mockUuid,
        key: testKey,
        deliveryMode: 'all' as DeliveryMode,
        callback: jest.fn(),
      };
      await client.subscribeWaitForRemote(callbackInfo, 1000);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(loggerDebug).toHaveBeenCalledWith(
        'Remote config client subscription wait for remote mode exceeded timeout. Try to fetch from cache.',
      );
      expect(storageFetchConfig).toHaveBeenCalledTimes(1);
      expect(loggerDebug).toHaveBeenCalledWith(
        'Remote config client subscription wait for remote mode returns a cached copy.',
      );
      expect(sendCallback).toHaveBeenCalledWith(callbackInfo, remoteConfigInfo, 'cache');
    });

    test('should return nil if remote fetch exceed timeout and cache is empty', async () => {
      // fetch() returns in 1.5s
      const fetch = jest.spyOn(client, 'fetch');
      const sendCallback = jest.spyOn(client, 'sendCallback');
      const remoteConfigInfo = {
        remoteConfig: null, // cache is empty
        lastFetch: new Date(),
      };
      fetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(remoteConfigInfo);
            }, 1500);
          }),
      );

      // storage.fetchConfig() returns immediately
      storageFetchConfig.mockReturnValueOnce(Promise.resolve(remoteConfigInfo));

      const callbackInfo = {
        id: mockUuid,
        key: testKey,
        deliveryMode: 'all' as DeliveryMode,
        callback: jest.fn(),
      };
      await client.subscribeWaitForRemote(callbackInfo, 1000);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(loggerDebug).toHaveBeenCalledWith(
        'Remote config client subscription wait for remote mode exceeded timeout. Try to fetch from cache.',
      );
      expect(storageFetchConfig).toHaveBeenCalledTimes(1);
      expect(loggerDebug).toHaveBeenCalledWith(
        'Remote config client subscription wait for remote mode failed to fetch cache.',
      );
      expect(sendCallback).toHaveBeenCalledWith(callbackInfo, remoteConfigInfo, 'remote');
    });
  });

  describe('sendCallback', () => {
    let callback: jest.Mock;
    let remoteConfigInfo: RemoteConfigInfo;

    beforeEach(() => {
      callback = jest.fn();
      remoteConfigInfo = {
        remoteConfig: {
          a: {
            b: {
              c: 1,
            },
            d: 2,
          },
        },
        lastFetch: new Date(),
      };
    });

    test('should call callback with filtered config if key exists', () => {
      const callbackInfo: CallbackInfo = {
        id: mockUuid,
        key: 'a.b',
        deliveryMode: 'all' as DeliveryMode,
        callback,
      };

      client.sendCallback(callbackInfo, remoteConfigInfo, 'remote');

      expect(callback).toHaveBeenCalledWith(
        { c: 1 }, // Expected filtered config
        'remote',
        remoteConfigInfo.lastFetch,
      );
      expect(callbackInfo.lastCallback).toBeDefined();
    });

    test('should call callback with null if key is not found', () => {
      const callbackInfo: CallbackInfo = {
        id: mockUuid,
        key: 'x.y', // Non-existent key
        deliveryMode: 'all' as DeliveryMode,
        callback,
      };

      client.sendCallback(callbackInfo, remoteConfigInfo, 'remote');

      expect(callback).toHaveBeenCalledWith(null, 'remote', remoteConfigInfo.lastFetch);
      expect(callbackInfo.lastCallback).toBeDefined();
    });

    test('should call callback with full config if key is empty', () => {
      const callbackInfo: CallbackInfo = {
        id: mockUuid,
        key: '',
        deliveryMode: 'all' as DeliveryMode,
        callback,
      };

      client.sendCallback(callbackInfo, remoteConfigInfo, 'remote');

      expect(callback).toHaveBeenCalledWith(remoteConfigInfo.remoteConfig, 'remote', remoteConfigInfo.lastFetch);
      expect(callbackInfo.lastCallback).toBeDefined();
    });

    test('should call callback with full config if key is undefined', () => {
      const callbackInfo: CallbackInfo = {
        id: mockUuid,
        key: undefined,
        deliveryMode: 'all' as DeliveryMode,
        callback,
      };

      client.sendCallback(callbackInfo, remoteConfigInfo, 'remote');

      expect(callback).toHaveBeenCalledWith(remoteConfigInfo.remoteConfig, 'remote', remoteConfigInfo.lastFetch);
      expect(callbackInfo.lastCallback).toBeDefined();
    });
  });

  describe('fetch', () => {
    test('should return successful response when fetch succeeds', async () => {
      const mockResponse = {
        remoteConfig: { key: 'value' },
        lastFetch: new Date(),
      };
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse.remoteConfig),
        } as Response),
      );

      const result = await client.fetch();

      expect(result.remoteConfig).toEqual(mockResponse.remoteConfig);
      expect(result.lastFetch).toBeInstanceOf(Date);
    });

    test('should retry and succeed when the first attempt fails', async () => {
      const mockResponse = {
        remoteConfig: { key: 'value' },
        lastFetch: new Date(),
      };

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server error'),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse.remoteConfig),
        } as Response);

      const result = await client.fetch(2);

      expect(result.remoteConfig).toEqual(mockResponse.remoteConfig);
      expect(result.lastFetch).toBeInstanceOf(Date);
      expect(loggerDebug).toHaveBeenCalledWith(expect.stringContaining('failed with 500'));
    });

    test('should retry and fail after maximum retries', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server error'),
        } as Response),
      );

      const result = await client.fetch(2);
      expect(result.remoteConfig).toBeNull();
      expect(result.lastFetch).toBeInstanceOf(Date);
      expect(loggerDebug).toHaveBeenCalledTimes(2);
      expect(loggerDebug).toHaveBeenCalledWith(expect.stringContaining('failed with 500'));
    });

    test('should handle network errors and retry', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network Error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ key: 'value' }),
        } as Response);

      const result = await client.fetch(2);
      expect(result.remoteConfig).toEqual({ key: 'value' });
      expect(result.lastFetch).toBeInstanceOf(Date);
      expect(loggerDebug).toHaveBeenCalledWith(expect.stringContaining('is rejected because:'), expect.any(Error));
    });

    test('should retry and fail after max retries on network error', async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error('Network Error')));

      const result = await client.fetch(2);
      expect(result.remoteConfig).toBeNull();
      expect(result.lastFetch).toBeInstanceOf(Date);
      expect(loggerDebug).toHaveBeenCalledTimes(2);
      expect(loggerDebug).toHaveBeenCalledWith(expect.stringContaining('is rejected because:'), expect.any(Error));
    });
  });

  describe('getUrlParams', () => {
    test('should generate correct US URL', () => {
      const expectedUrl =
        `https://sr-client-cfg.amplitude.com/config/test-api-key?` +
        `config_keys=analyticsSDK.browserSDK&` +
        `config_keys=sessionReplay.sr_interaction_config&` +
        `config_keys=sessionReplay.sr_logging_config&` +
        `config_keys=sessionReplay.sr_privacy_config&` +
        `config_keys=sessionReplay.sr_sampling_config&` +
        `config_keys=sessionReplay.sr_targeting_config`;
      const url = client.getUrlParams();
      expect(url).toBe(expectedUrl);
    });

    test('should generate correct EU URL', () => {
      client = new RemoteConfigClient(mockApiKey, mockLogger, 'EU');
      const expectedUrl =
        `https://sr-client-cfg.eu.amplitude.com/config/test-api-key?` +
        `config_keys=analyticsSDK.browserSDK&` +
        `config_keys=sessionReplay.sr_interaction_config&` +
        `config_keys=sessionReplay.sr_logging_config&` +
        `config_keys=sessionReplay.sr_privacy_config&` +
        `config_keys=sessionReplay.sr_sampling_config&` +
        `config_keys=sessionReplay.sr_targeting_config`;
      const url = client.getUrlParams();
      expect(url).toBe(expectedUrl);
    });
  });
});
