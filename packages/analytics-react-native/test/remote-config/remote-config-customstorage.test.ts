import { RemoteConfigCustomStorage } from '../../src/remote-config/remote-config-customstorage';
import { ILogger, ReactNativeStorageData, Storage } from '@amplitude/analytics-core';
import { RemoteConfig, RemoteConfigInfo } from '@amplitude/analytics-core/lib/esm/remote-config/remote-config';

describe('RemoteConfigCustomStorage', () => {
  let logger: ILogger;
  let loggerDebug: jest.SpyInstance;
  let customStorage: Storage<ReactNativeStorageData>;
  let storage: RemoteConfigCustomStorage;
  const apiKey = '12345678901234567890';
  const storageKey = `AMP_remote_config_${apiKey.substring(0, 10)}`;

  beforeEach(() => {
    logger = {
      disable: jest.fn(),
      enable: jest.fn(),
      debug: jest.fn(),
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    loggerDebug = jest.spyOn(logger, 'debug');

    customStorage = {
      isEnabled: jest.fn().mockResolvedValue(true),
      get: jest.fn().mockResolvedValue(undefined),
      getRaw: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn().mockResolvedValue(undefined),
    };
    storage = new RemoteConfigCustomStorage(apiKey, logger, customStorage);
  });

  describe('fetchConfig', () => {
    it('should return remote config info', async () => {
      const lastFetch = new Date('2025-03-20T12:00:00Z');
      const remoteConfig: RemoteConfig = { key1: 'value1' };
      jest.mocked(customStorage.get).mockResolvedValueOnce({ remoteConfig, lastFetch });

      const result = await storage.fetchConfig();

      expect(customStorage.get).toHaveBeenCalledWith(storageKey);
      expect(result.remoteConfig).toEqual(remoteConfig);
      expect(result.lastFetch).toEqual(lastFetch);
      expect(loggerDebug).toHaveBeenCalledWith(
        expect.stringContaining('Remote config customstorage parsed successfully:'),
      );
    });

    it('should revive a serialized lastFetch', async () => {
      const lastFetch = new Date('2025-03-20T12:00:00Z');
      jest.mocked(customStorage.get).mockResolvedValueOnce({
        remoteConfig: { key1: 'value1' },
        lastFetch: lastFetch.toISOString(),
      });

      const result = await storage.fetchConfig();

      expect(result.lastFetch).toEqual(lastFetch);
    });

    it('should default missing fields', async () => {
      jest.mocked(customStorage.get).mockResolvedValueOnce({});

      const result = await storage.fetchConfig();

      expect(result.remoteConfig).toBeNull();
      expect(result.lastFetch).toBeInstanceOf(Date);
    });

    it('should return remote config info null if the key does not exist', async () => {
      const result = await storage.fetchConfig();

      expect(result.remoteConfig).toBeNull();
      expect(result.lastFetch).toBeInstanceOf(Date);
      expect(loggerDebug).toHaveBeenCalledWith('Remote config customstorage gets no valid config for the key');
    });

    it('should return remote config info null if the stored value is not a config object', async () => {
      jest.mocked(customStorage.get).mockResolvedValueOnce([{ event_type: 'queued' }]);

      const result = await storage.fetchConfig();

      expect(result.remoteConfig).toBeNull();
      expect(loggerDebug).toHaveBeenCalledWith('Remote config customstorage gets no valid config for the key');
    });

    it('should return remote config info null if the storage throws an error', async () => {
      jest.mocked(customStorage.get).mockRejectedValueOnce(new Error('storage is unavailable'));

      const result = await storage.fetchConfig();

      expect(result.remoteConfig).toBeNull();
      expect(result.lastFetch).toBeInstanceOf(Date);
      expect(loggerDebug).toHaveBeenCalledWith('Remote config customstorage failed to access: ', expect.any(Error));
    });
  });

  describe('setConfig', () => {
    it('should store the config and return true', async () => {
      const info: RemoteConfigInfo = {
        remoteConfig: { key1: 'value1' },
        lastFetch: new Date(),
      };

      const result = await storage.setConfig(info);

      expect(result).toBe(true);
      expect(customStorage.set).toHaveBeenCalledWith(storageKey, info);
      expect(loggerDebug).toHaveBeenCalledWith('Remote config customstorage set successfully.');
    });

    it('should return false and log an error if storing the config fails', async () => {
      jest.mocked(customStorage.set).mockRejectedValueOnce(new Error('storage quota exceeded'));
      const info: RemoteConfigInfo = {
        remoteConfig: { key1: 'value1' },
        lastFetch: new Date(),
      };

      const result = await storage.setConfig(info);

      expect(result).toBe(false);
      expect(loggerDebug).toHaveBeenCalledWith('Remote config customstorage failed to set: ', expect.any(Error));
    });
  });
});
