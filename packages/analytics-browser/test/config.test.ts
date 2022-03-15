import * as ConfigModule from '../src/config';
import * as CookieModule from '../src/storage/cookie';
import * as LocalStorageModule from '../src/storage/local-storage';
import * as MemoryModule from '../src/storage/memory';
import * as core from '@amplitude/analytics-core';

import { FetchTransport } from '../src/transports/fetch';

describe('config', () => {
  describe('createConfig', () => {
    test('should create default config', () => {
      jest.spyOn(ConfigModule, 'createCookieStorage').mockReturnValueOnce(new MemoryModule.MemoryStorage());
      jest.spyOn(ConfigModule, 'createEventsStorage').mockReturnValueOnce(new MemoryModule.MemoryStorage());
      const config = ConfigModule.createConfig();
      expect(config).toEqual({
        cookieStorage: new MemoryModule.MemoryStorage(),
        cookieExpiration: 365,
        cookieSameSite: 'Lax',
        cookieSecure: false,
        disableCookies: false,
        domain: '',
        storageProvider: new MemoryModule.MemoryStorage(),
        trackingOptions: {
          city: true,
          country: true,
          carrier: true,
          device_manufacturer: true,
          device_model: true,
          dma: true,
          ip_address: true,
          language: true,
          os_name: true,
          os_version: true,
          platform: true,
          region: true,
          version_name: true,
        },
        transportProvider: new FetchTransport(),
      });
    });
  });

  describe('createCookieStorage', () => {
    test('should return custom', () => {
      const cookieStorage = {
        options: {},
        isEnabled: () => true,
        get: () => ({}),
        set: () => undefined,
        remove: () => undefined,
        reset: () => undefined,
      };
      const storage = ConfigModule.createCookieStorage({
        cookieStorage,
      });
      expect(storage).toBe(cookieStorage);
    });

    test('should return cookies', () => {
      const storage = ConfigModule.createCookieStorage();
      expect(storage).toBeInstanceOf(CookieModule.CookieStorage);
    });

    test('should use return storage', () => {
      const storage = ConfigModule.createCookieStorage({ disableCookies: true });
      expect(storage).toBeInstanceOf(LocalStorageModule.LocalStorage);
    });

    test('should use memory', () => {
      const cookiesConstructor = jest.spyOn(CookieModule, 'CookieStorage').mockReturnValueOnce({
        options: {},
        isEnabled: () => false,
        get: () => '',
        set: () => undefined,
        remove: () => undefined,
        reset: () => undefined,
      });
      const localStorageConstructor = jest.spyOn(LocalStorageModule, 'LocalStorage').mockReturnValueOnce({
        isEnabled: () => false,
        get: () => '',
        set: () => undefined,
        remove: () => undefined,
        reset: () => undefined,
      });
      const storage = ConfigModule.createCookieStorage();
      expect(storage).toBeInstanceOf(MemoryModule.MemoryStorage);
      expect(cookiesConstructor).toHaveBeenCalledTimes(1);
      expect(localStorageConstructor).toHaveBeenCalledTimes(1);
    });
  });

  describe('createEventsStorage', () => {
    test('should return custom', () => {
      const storageProvider = {
        isEnabled: () => true,
        get: () => [],
        set: () => undefined,
        remove: () => undefined,
        reset: () => undefined,
      };
      const storage = ConfigModule.createEventsStorage({
        storageProvider,
      });
      expect(storage).toBe(storageProvider);
    });

    test('should use return storage', () => {
      const storage = ConfigModule.createEventsStorage();
      expect(storage).toBeInstanceOf(LocalStorageModule.LocalStorage);
    });

    test('should use memory', () => {
      const localStorageConstructor = jest.spyOn(LocalStorageModule, 'LocalStorage').mockReturnValueOnce({
        isEnabled: () => false,
        get: () => '',
        set: () => undefined,
        remove: () => undefined,
        reset: () => undefined,
      });
      const storage = ConfigModule.createEventsStorage();
      expect(storage).toBeInstanceOf(MemoryModule.MemoryStorage);
      expect(localStorageConstructor).toHaveBeenCalledTimes(1);
    });
  });

  describe('getConfig', () => {
    test('should call core get config', () => {
      const _getConfig = jest.spyOn(core, 'getConfig');
      const config = ConfigModule.getConfig();
      expect(config).toBe(undefined);
      expect(_getConfig).toHaveBeenCalledTimes(1);
    });
  });
});
