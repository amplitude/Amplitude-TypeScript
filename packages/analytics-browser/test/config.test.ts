import * as Config from '../src/config';
import * as CookieModule from '../src/storage/cookie';
import * as LocalStorageModule from '../src/storage/local-storage';
import * as MemoryModule from '../src/storage/memory';
import * as core from '@amplitude/analytics-core';

import { LogLevel, UserSession } from '@amplitude/analytics-types';

import { FetchTransport } from '../src/transports/fetch';
import { getCookieName } from '../src/session-manager';

describe('config', () => {
  const API_KEY = 'apiKey';
  describe('createConfig', () => {
    test('should create default config', () => {
      jest.spyOn(Config, 'createCookieStorage').mockReturnValueOnce(new MemoryModule.MemoryStorage());
      jest.spyOn(Config, 'createEventsStorage').mockReturnValueOnce(new MemoryModule.MemoryStorage());
      jest.spyOn(Config, 'createDeviceId').mockReturnValueOnce('deviceId');
      jest.spyOn(Config, 'createSessionId').mockReturnValueOnce(0);
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = Config.createConfig(API_KEY, undefined, {
        deviceId: 'deviceId',
        partnerId: 'partnerId',
      });
      expect(config).toEqual({
        apiKey: API_KEY,
        cookieStorage: new MemoryModule.MemoryStorage(),
        cookieExpiration: 365,
        cookieSameSite: 'Lax',
        cookieSecure: false,
        deviceId: 'deviceId',
        disableCookies: false,
        domain: '',
        flushIntervalMillis: 1000,
        flushMaxRetries: 5,
        flushQueueSize: 10,
        loggerProvider: logger,
        logLevel: LogLevel.Warn,
        includeGclid: true,
        includeFbclid: true,
        includeReferrer: true,
        includeUtm: true,
        optOut: false,
        partnerId: 'partnerId',
        plugins: [],
        saveEvents: true,
        serverUrl: 'https://api2.amplitude.com/2/httpapi',
        sessionId: 0,
        sessionTimeout: 1800000,
        storageProvider: new MemoryModule.MemoryStorage(),
        trackingOptions: {
          city: true,
          country: true,
          carrier: true,
          deviceManufacturer: true,
          deviceModel: true,
          dma: true,
          ipAddress: true,
          language: true,
          osName: true,
          osVersion: true,
          platform: true,
          region: true,
          versionName: true,
        },
        transportProvider: new FetchTransport(),
        userId: undefined,
      });
    });

    test('should create using cookies', () => {
      const cookieStorage = new MemoryModule.MemoryStorage<UserSession>();
      cookieStorage.set(getCookieName(API_KEY), {
        deviceId: 'deviceIdFromCookies',
        lastEventTime: Date.now(),
        sessionId: 1,
        userId: 'userIdFromCookies',
        optOut: false,
      });
      jest.spyOn(Config, 'createCookieStorage').mockReturnValueOnce(cookieStorage);
      jest.spyOn(Config, 'createEventsStorage').mockReturnValueOnce(new MemoryModule.MemoryStorage());
      jest.spyOn(Config, 'createDeviceId').mockReturnValueOnce('deviceIdFromCookies');
      jest.spyOn(Config, 'createSessionId').mockReturnValueOnce(1);
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = Config.createConfig(API_KEY);
      expect(config).toEqual({
        apiKey: API_KEY,
        cookieStorage: cookieStorage,
        cookieExpiration: 365,
        cookieSameSite: 'Lax',
        cookieSecure: false,
        deviceId: 'deviceIdFromCookies',
        disableCookies: false,
        domain: '',
        flushIntervalMillis: 1000,
        flushMaxRetries: 5,
        flushQueueSize: 10,
        loggerProvider: logger,
        logLevel: LogLevel.Warn,
        includeGclid: true,
        includeFbclid: true,
        includeReferrer: true,
        includeUtm: true,
        optOut: false,
        partnerId: undefined,
        plugins: [],
        saveEvents: true,
        serverUrl: 'https://api2.amplitude.com/2/httpapi',
        sessionId: 1,
        sessionTimeout: 1800000,
        storageProvider: new MemoryModule.MemoryStorage(),
        trackingOptions: {
          city: true,
          country: true,
          carrier: true,
          deviceManufacturer: true,
          deviceModel: true,
          dma: true,
          ipAddress: true,
          language: true,
          osName: true,
          osVersion: true,
          platform: true,
          region: true,
          versionName: true,
        },
        transportProvider: new FetchTransport(),
        userId: 'userIdFromCookies',
      });
    });
  });

  describe('createCookieStorage', () => {
    test('should return custom', () => {
      const cookieStorage = {
        options: {},
        isEnabled: () => true,
        get: () => ({
          optOut: false,
        }),
        set: () => undefined,
        remove: () => undefined,
        reset: () => undefined,
      };
      const storage = Config.createCookieStorage({
        cookieStorage,
      });
      expect(storage).toBe(cookieStorage);
    });

    test('should return cookies', () => {
      const storage = Config.createCookieStorage();
      expect(storage).toBeInstanceOf(CookieModule.CookieStorage);
    });

    test('should use return storage', () => {
      const storage = Config.createCookieStorage({ disableCookies: true });
      expect(storage).toBeInstanceOf(LocalStorageModule.LocalStorage);
    });

    test('should use memory', () => {
      const cookiesConstructor = jest.spyOn(CookieModule, 'CookieStorage').mockReturnValueOnce({
        options: {},
        isEnabled: () => false,
        get: () => '',
        findByKey: () => '',
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
      const storage = Config.createCookieStorage();
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
      const storage = Config.createEventsStorage({
        storageProvider,
      });
      expect(storage).toBe(storageProvider);
    });

    test('should use return storage', () => {
      const storage = Config.createEventsStorage();
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
      const storage = Config.createEventsStorage();
      expect(storage).toBeInstanceOf(MemoryModule.MemoryStorage);
      expect(localStorageConstructor).toHaveBeenCalledTimes(1);
    });
  });

  describe('createDeviceId', () => {
    test('should return device id from options', () => {
      const deviceId = Config.createDeviceId('cookieDeviceId', 'optionsDeviceId', 'queryParamsDeviceId');
      expect(deviceId).toBe('optionsDeviceId');
    });

    test('should return device id from query params', () => {
      const deviceId = Config.createDeviceId('cookieDeviceId', undefined, 'queryParamsDeviceId');
      expect(deviceId).toBe('queryParamsDeviceId');
    });

    test('should return device id from cookies', () => {
      const deviceId = Config.createDeviceId('cookieDeviceId', undefined, undefined);
      expect(deviceId).toBe('cookieDeviceId');
    });

    test('should return uuid', () => {
      const deviceId = Config.createDeviceId(undefined, undefined, undefined);
      expect(deviceId.substring(14, 15)).toEqual('4');
    });
  });

  describe('createSessionId', () => {
    test('should return session id from cookies', () => {
      const now = Date.now();
      const sessionId = Config.createSessionId(now + 1000, undefined, now - 1000, 60000);
      expect(sessionId).toBe(now + 1000);
    });

    test('should return session id from options', () => {
      const now = Date.now();
      const sessionId = Config.createSessionId(undefined, now, undefined, 60000);
      expect(sessionId).toBe(now);
    });

    test('should generate new session id', () => {
      jest.spyOn(Date, 'now').mockReturnValueOnce(1);
      const sessionId = Config.createSessionId(undefined, undefined, undefined, 60000);
      expect(sessionId).toBe(1);
    });
  });

  describe('getConfig', () => {
    test('should call core get config', () => {
      const _getConfig = jest.spyOn(core, 'getConfig');
      const config = Config.getConfig();
      expect(config).toBe(undefined);
      expect(_getConfig).toHaveBeenCalledTimes(1);
    });
  });
});
