/**
 * @jest-environment jsdom
 */

import { RemoteConfigLocalStorage } from '../../src/remote-config/remote-config-localstorage';
import { RemoteConfig, RemoteConfigInfo } from '../../src/remote-config/remote-config';
import { ILogger } from '../../src/logger';

describe('RemoteConfigLocalStorage', () => {
  let logger: ILogger;
  let loggerDebug: jest.SpyInstance;
  let storage: RemoteConfigLocalStorage;
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

    storage = new RemoteConfigLocalStorage(apiKey, logger);
    localStorage.clear();

    jest.useFakeTimers().setSystemTime(mockDate);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('fetchConfig', () => {
    it('should return remote config info', async () => {
      const lastFetch = new Date('2025-03-20T12:00:00Z');
      const remoteConfig: RemoteConfig = { key1: 'value1' };
      const mockConfigInfo: RemoteConfigInfo = {
        remoteConfig: remoteConfig,
        lastFetch: lastFetch,
      };
      localStorage.setItem(storageKey, JSON.stringify(mockConfigInfo));

      const result = await storage.fetchConfig();

      expect(result.remoteConfig).toEqual(remoteConfig);
      expect(result.lastFetch).toEqual(lastFetch);
      expect(loggerDebug).toHaveBeenCalledWith(
        expect.stringContaining('Remote config localstorage parsed successfully:'),
      );
    });

    it('should return remote config info null and clear storage if JSON parsing fails', async () => {
      localStorage.setItem(storageKey, '{ invalid json }');

      const result = await storage.fetchConfig();

      expect(result.remoteConfig).toBeNull();
      expect(result.lastFetch).toEqual(mockDate);
      expect(loggerDebug).toHaveBeenCalledWith('Remote config localstorage failed to parse: ', expect.any(Error));
      expect(localStorage.getItem(storageKey)).toBeNull();
    });

    it('should return remote config info null localStorage is empty', async () => {
      const result = await storage.fetchConfig();

      expect(result.remoteConfig).toBeNull();
      expect(result.lastFetch).toBeInstanceOf(Date);
      expect(loggerDebug).toHaveBeenCalledWith('Remote config localstorage gets null because the key does not exist');
    });

    it('should return remote config info null if localStorage.getItem throws an error', async () => {
      const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('localStorage is undefined');
      });

      const result = await storage.fetchConfig();

      expect(result.remoteConfig).toBeNull();
      expect(result.lastFetch).toBeInstanceOf(Date);
      expect(loggerDebug).toHaveBeenCalledWith('Remote config localstorage failed to access: ', expect.any(Error));

      // Restore the original getItem implementation
      getItemSpy.mockRestore();
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

  describe('when localStorage is unavailable', () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

    beforeEach(() => {
      Object.defineProperty(globalThis, 'localStorage', { value: undefined, configurable: true });
    });

    afterEach(() => {
      if (localStorageDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', localStorageDescriptor);
      }
    });

    it('should return remote config info null from fetchConfig', async () => {
      const result = await new RemoteConfigLocalStorage(apiKey, logger).fetchConfig();

      expect(result.remoteConfig).toBeNull();
      expect(result.lastFetch).toEqual(mockDate);
    });

    it('should return false from setConfig', async () => {
      const info: RemoteConfigInfo = {
        remoteConfig: { key1: 'value1' },
        lastFetch: new Date(),
      };

      expect(await new RemoteConfigLocalStorage(apiKey, logger).setConfig(info)).toBe(false);
    });
  });

  describe('when accessing localStorage throws', () => {
    // Node 26 ignores getters defined directly on the jsdom global, so the own `localStorage`
    // property is removed and the throwing getter is installed on the prototype instead, where
    // ordinary prototype chain lookup reaches it on every Node version.
    const globalObject = globalThis as unknown as Record<string, unknown>;
    const windowPrototype = Object.getPrototypeOf(globalThis) as Record<string, unknown>;
    const realLocalStorage = localStorage;

    beforeEach(() => {
      delete globalObject.localStorage;
      Object.defineProperty(windowPrototype, 'localStorage', {
        configurable: true,
        get() {
          throw new Error(
            `Failed to read the 'localStorage' property from 'Window': Access is denied for this document`,
          );
        },
      });
    });

    afterEach(() => {
      delete windowPrototype.localStorage;
      Object.defineProperty(globalThis, 'localStorage', {
        value: realLocalStorage,
        configurable: true,
        writable: true,
      });
    });

    it('should not throw when constructing', () => {
      expect(() => new RemoteConfigLocalStorage(apiKey, logger)).not.toThrow();
      expect(loggerDebug).toHaveBeenCalledWith('Remote config localstorage failed to access: ', expect.any(Error));
    });
  });

  describe('constructor', () => {
    it('should preserve the legacy browser storage key', async () => {
      const info: RemoteConfigInfo = {
        remoteConfig: { key1: 'value1' },
        lastFetch: new Date(),
      };

      await new RemoteConfigLocalStorage(apiKey, logger).setConfig(info);

      expect(localStorage.getItem(storageKey)).toEqual(JSON.stringify(info));
    });
  });
});
