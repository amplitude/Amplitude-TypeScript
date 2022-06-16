import * as Config from '../src/config';
import * as CookieModule from '../src/storage/cookie';
import * as LocalStorageModule from '../src/storage/local-storage';
import * as core from '@amplitude/analytics-core';
import { LogLevel, TransportType, UserSession } from '@amplitude/analytics-types';
import { FetchTransport } from '../src/transports/fetch';
import { getCookieName } from '../src/utils/cookie-name';
import { XHRTransport } from '../src/transports/xhr';
import { createTransport } from '../src/config';
import { SendBeaconTransport } from '../src/transports/send-beacon';
import { SessionManager } from '../src/session-manager';

describe('config', () => {
  const API_KEY = 'apiKey';

  describe('BrowserConfig', () => {
    test('should create overwrite config', () => {
      const cookieStorage = new core.MemoryStorage<UserSession>();
      cookieStorage.set(getCookieName(API_KEY), {
        deviceId: undefined,
        lastEventTime: undefined,
        optOut: false,
        sessionId: undefined,
        userId: undefined,
      });
      const sessionManager = new SessionManager(cookieStorage, {
        apiKey: API_KEY,
        sessionTimeout: 1800000,
      });
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = new Config.BrowserConfig(API_KEY);
      expect(config).toEqual({
        apiKey: API_KEY,
        appVersion: undefined,
        cookieStorage,
        cookieExpiration: 365,
        cookieSameSite: 'Lax',
        cookieSecure: false,
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
        minIdLength: undefined,
        _optOut: false,
        partnerId: undefined,
        plugins: [],
        saveEvents: true,
        serverUrl: 'https://api2.amplitude.com/2/httpapi',
        serverZone: 'US',
        sessionManager,
        sessionTimeout: 1800000,
        storageProvider: new core.MemoryStorage(),
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
        useBatch: false,
      });
    });
  });

  describe('useBrowserConfig', () => {
    test('should create default config', () => {
      const cookieStorage = new core.MemoryStorage<UserSession>();
      cookieStorage.set(getCookieName(API_KEY), {
        deviceId: 'deviceId',
        lastEventTime: undefined,
        optOut: false,
        sessionId: undefined,
        userId: undefined,
      });
      const sessionManager = new SessionManager(cookieStorage, {
        apiKey: API_KEY,
        sessionTimeout: 1800000,
      });
      jest.spyOn(Config, 'createCookieStorage').mockReturnValueOnce(new core.MemoryStorage());
      jest.spyOn(Config, 'createEventsStorage').mockReturnValueOnce(new core.MemoryStorage());
      jest.spyOn(Config, 'createDeviceId').mockReturnValueOnce('deviceId');
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = Config.useBrowserConfig(API_KEY, undefined);
      expect(config).toEqual({
        apiKey: API_KEY,
        appVersion: undefined,
        cookieStorage,
        cookieExpiration: 365,
        cookieSameSite: 'Lax',
        cookieSecure: false,
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
        minIdLength: undefined,
        _optOut: false,
        partnerId: undefined,
        plugins: [],
        saveEvents: true,
        serverUrl: 'https://api2.amplitude.com/2/httpapi',
        serverZone: 'US',
        sessionManager,
        sessionTimeout: 1800000,
        storageProvider: new core.MemoryStorage(),
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
        useBatch: false,
      });
    });

    test('should create using cookies/overwrite', () => {
      const cookieStorage = new core.MemoryStorage<UserSession>();
      cookieStorage.set(getCookieName(API_KEY), {
        deviceId: 'deviceIdFromCookies',
        lastEventTime: Date.now(),
        sessionId: undefined,
        userId: 'userIdFromCookies',
        optOut: false,
      });
      const sessionManager = new SessionManager(cookieStorage, {
        apiKey: API_KEY,
        sessionTimeout: 1,
      });
      jest.spyOn(Config, 'createCookieStorage').mockReturnValueOnce(cookieStorage);
      jest.spyOn(Config, 'createEventsStorage').mockReturnValueOnce(new core.MemoryStorage());
      jest.spyOn(Config, 'createDeviceId').mockReturnValueOnce('deviceIdFromCookies');
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = Config.useBrowserConfig(API_KEY, undefined, {
        partnerId: 'partnerId',
        sessionTimeout: 1,
      });
      expect(config).toEqual({
        apiKey: API_KEY,
        appVersion: undefined,
        cookieStorage,
        cookieExpiration: 365,
        cookieSameSite: 'Lax',
        cookieSecure: false,
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
        minIdLength: undefined,
        _optOut: false,
        partnerId: 'partnerId',
        plugins: [],
        saveEvents: true,
        serverUrl: 'https://api2.amplitude.com/2/httpapi',
        serverZone: 'US',
        sessionManager,
        sessionTimeout: 1,
        storageProvider: new core.MemoryStorage(),
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
        useBatch: false,
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
        getRaw: () => undefined,
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
        getRaw: () => '',
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
        getRaw: () => undefined,
      });
      const storage = Config.createCookieStorage();
      expect(storage).toBeInstanceOf(core.MemoryStorage);
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
        getRaw: () => undefined,
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
        getRaw: () => undefined,
      });
      const storage = Config.createEventsStorage();
      expect(storage).toBeInstanceOf(core.MemoryStorage);
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

  describe('createTransport', () => {
    test('should return xhr', () => {
      expect(createTransport(TransportType.XHR)).toBeInstanceOf(XHRTransport);
    });

    test('should return beacon', () => {
      expect(createTransport(TransportType.SendBeacon)).toBeInstanceOf(SendBeaconTransport);
    });

    test('should return fetch', () => {
      expect(createTransport(TransportType.Fetch)).toBeInstanceOf(FetchTransport);
    });
  });
});
