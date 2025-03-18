/**
 * @jest-environment jsdom
 */

import { RemoteConfigLocalstorage } from '../../src/remote-config/remote-config-localstorage';
import { RemoteConfigInfo, RemoteConfig } from '../../src/remote-config/remote-config';
import { ILogger } from '../../src/logger';

describe('RemoteConfigLocalstorage', () => {
  let logger: ILogger;
  let loggerDebug: jest.SpyInstance;
  let storage: RemoteConfigLocalstorage;
  const apiKey = '12345678901234567890';
  const storageKey = `AMP_remote_config_${apiKey.substring(0, 10)}`;
  const mockDate = new Date('2025-03-18T12:00:00Z');

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

    storage = new RemoteConfigLocalstorage(apiKey, logger);
    localStorage.clear();

    jest.useFakeTimers().setSystemTime(mockDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('fetchConfig', () => {
    it('should return remote config info', async () => {
      const mockConfig: RemoteConfig = { key1: 'value1' };
      localStorage.setItem(storageKey, JSON.stringify(mockConfig));

      const result = await storage.fetchConfig();

      expect(result.remoteConfig).toEqual(mockConfig);
      expect(result.lastFetch).toEqual(mockDate);
      expect(loggerDebug).toHaveBeenCalledWith('Remote config localstorage get successfully.');
    });

    it('should return remote config info null if JSON parsing fails', async () => {
      localStorage.setItem(storageKey, '{ invalid json }');

      const result = await storage.fetchConfig();

      expect(result.remoteConfig).toBeNull();
      expect(result.lastFetch).toEqual(mockDate);
      expect(loggerDebug).toHaveBeenCalledWith('Remote config localstorage failed to get: ', expect.any(Error));
    });

    it('should return remote config info null localStorage is empty', async () => {
      const result = await storage.fetchConfig();

      expect(result.remoteConfig).toBeNull();
      expect(result.lastFetch).toBeInstanceOf(Date);
      expect(loggerDebug).toHaveBeenCalledWith('Remote config localstorage gets null because the key does not exist');
    });
  });

  describe('setConfig', () => {
    it('should store the config in localStorage and return true', async () => {
      const info: RemoteConfigInfo = {
        remoteConfig: { key1: 'value1' },
        lastFetch: new Date(),
      };

      const result = await storage.setConfig(info);

      expect(result).toBe(true);
      expect(localStorage.getItem(storageKey)).toEqual(JSON.stringify(info));
      expect(loggerDebug).toHaveBeenCalledWith('Remote config localstorage set successfully.');
    });

    it('should return false and log an error if storing the config fails', async () => {
      // Mock localStorage.setItem to throw an error
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const info: RemoteConfigInfo = {
        remoteConfig: { key1: 'value1' },
        lastFetch: new Date(),
      };

      const result = await storage.setConfig(info);

      expect(result).toBe(false);
      expect(loggerDebug).toHaveBeenCalledWith('Remote config localstorage failed to set: ', expect.any(Error));

      // Restore the mock
      jest.restoreAllMocks();
    });
  });
});
