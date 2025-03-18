import { DeliveryMode, EU_SERVER_URL, RemoteConfigClient, US_SERVER_URL } from '../../src/remote-config/remote-config';
import { ILogger } from '../../src/logger';
import { RemoteConfigLocalstorage } from '../../src/remote-config/remote-config-localstorage';

jest.mock('../../src/remote-config/remote-config-localstorage');
const mockUuid = 'uuid123456789';
jest.mock('../../src/utils/uuid', () => ({
  __esModule: true, // This is important for ES modules
  UUID: jest.fn(() => mockUuid),
}));

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

  beforeEach(() => {
    loggerDebug = jest.spyOn(mockLogger, 'debug');

    (RemoteConfigLocalstorage as jest.Mock).mockImplementation(() => mockStorage);
    client = new RemoteConfigClient(mockApiKey, mockLogger);
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
});
