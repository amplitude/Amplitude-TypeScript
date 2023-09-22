import * as Config from '../src/config';
import * as LocalStorageModule from '../src/storage/local-storage';
import * as core from '@amplitude/analytics-core';
import { LogLevel, Storage, UserSession } from '@amplitude/analytics-types';
import * as BrowserUtils from '@amplitude/analytics-client-common';
import { getCookieName, FetchTransport } from '@amplitude/analytics-client-common';
import { isWeb } from '../src/utils/platform';
import { uuidPattern } from './helpers/constants';

describe('config', () => {
  const someUUID: string = expect.stringMatching(uuidPattern) as string;
  const someStorage: core.MemoryStorage<UserSession> = expect.any(
    core.MemoryStorage,
  ) as core.MemoryStorage<UserSession>;

  const API_KEY = 'apiKey';

  describe('BrowserConfig', () => {
    test('should create overwrite config', async () => {
      const cookieStorage = new core.MemoryStorage<UserSession>();
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = new Config.ReactNativeConfig('');
      expect(config).toEqual({
        apiKey: '',
        appVersion: undefined,
        cookieStorage,
        cookieExpiration: 365,
        cookieSameSite: 'Lax',
        cookieSecure: false,
        cookieUpgrade: true,
        disableCookies: false,
        domain: '',
        flushIntervalMillis: 1000,
        flushMaxRetries: 5,
        flushQueueSize: 30,
        instanceName: '$default_instance',
        loggerProvider: logger,
        logLevel: LogLevel.Warn,
        minIdLength: undefined,
        _optOut: false,
        partnerId: undefined,
        plan: undefined,
        ingestionMetadata: undefined,
        serverUrl: 'https://api2.amplitude.com/2/httpapi',
        serverZone: 'US',
        sessionTimeout: 300000,
        trackingOptions: {
          adid: true,
          carrier: true,
          deviceManufacturer: true,
          deviceModel: true,
          ipAddress: true,
          language: true,
          osName: true,
          osVersion: true,
          platform: true,
          appSetId: true,
          idfv: true,
        },
        transportProvider: new FetchTransport(),
        useBatch: false,
        diagnosticProvider: new core.Diagnostic(),
        trackingSessionEvents: false,
      });
    });
  });

  describe('useBrowserConfig', () => {
    test('should create default config', async () => {
      jest.spyOn(Config, 'createCookieStorage').mockResolvedValueOnce(new core.MemoryStorage());
      jest.spyOn(Config, 'createEventsStorage').mockResolvedValueOnce(new core.MemoryStorage());
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = await Config.useReactNativeConfig(API_KEY, undefined);
      expect(config).toEqual({
        apiKey: API_KEY,
        appVersion: undefined,
        cookieStorage: someStorage,
        cookieExpiration: 365,
        cookieSameSite: 'Lax',
        cookieSecure: false,
        cookieUpgrade: true,
        _deviceId: someUUID,
        disableCookies: false,
        domain: '',
        flushIntervalMillis: 1000,
        flushMaxRetries: 5,
        flushQueueSize: 30,
        instanceName: '$default_instance',
        loggerProvider: logger,
        logLevel: LogLevel.Warn,
        minIdLength: undefined,
        _optOut: false,
        partnerId: undefined,
        plan: undefined,
        ingestionMetadata: undefined,
        serverUrl: 'https://api2.amplitude.com/2/httpapi',
        serverZone: 'US',
        sessionTimeout: 300000,
        storageProvider: new core.MemoryStorage(),
        trackingOptions: {
          adid: true,
          carrier: true,
          deviceManufacturer: true,
          deviceModel: true,
          ipAddress: true,
          language: true,
          osName: true,
          osVersion: true,
          platform: true,
          appSetId: true,
          idfv: true,
        },
        transportProvider: new FetchTransport(),
        useBatch: false,
        diagnosticProvider: new core.Diagnostic(),
        trackingSessionEvents: false,
      });
    });

    test('should create using cookies/overwrite', async () => {
      const cookieStorage = new core.MemoryStorage<UserSession>();
      await cookieStorage.set(getCookieName(API_KEY), {
        deviceId: 'deviceIdFromCookies',
        lastEventTime: 1,
        sessionId: -1,
        userId: 'userIdFromCookies',
        optOut: false,
        lastEventId: 2,
      });
      jest.spyOn(Config, 'createCookieStorage').mockResolvedValueOnce(cookieStorage);
      jest.spyOn(Config, 'createEventsStorage').mockResolvedValueOnce(new core.MemoryStorage());
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = await Config.useReactNativeConfig(API_KEY, {
        partnerId: 'partnerId',
        plan: {
          version: '0',
        },
        ingestionMetadata: {
          sourceName: 'ampli',
          sourceVersion: '2.0.0',
        },
        sessionTimeout: 1,
        cookieUpgrade: false,
        disableCookies: true,
      });
      expect(config).toEqual({
        apiKey: API_KEY,
        appVersion: undefined,
        cookieStorage,
        cookieExpiration: 365,
        cookieSameSite: 'Lax',
        cookieSecure: false,
        cookieUpgrade: false,
        _deviceId: 'deviceIdFromCookies',
        disableCookies: true,
        domain: '',
        flushIntervalMillis: 1000,
        flushMaxRetries: 5,
        flushQueueSize: 30,
        instanceName: '$default_instance',
        _lastEventId: 2,
        _lastEventTime: 1,
        loggerProvider: logger,
        logLevel: LogLevel.Warn,
        minIdLength: undefined,
        _optOut: false,
        partnerId: 'partnerId',
        plan: {
          version: '0',
        },
        ingestionMetadata: {
          sourceName: 'ampli',
          sourceVersion: '2.0.0',
        },
        serverUrl: 'https://api2.amplitude.com/2/httpapi',
        serverZone: 'US',
        _sessionId: -1,
        sessionTimeout: 1,
        storageProvider: new core.MemoryStorage(),
        trackingSessionEvents: false,
        trackingOptions: {
          adid: true,
          carrier: true,
          deviceManufacturer: true,
          deviceModel: true,
          ipAddress: true,
          language: true,
          osName: true,
          osVersion: true,
          platform: true,
          appSetId: true,
          idfv: true,
        },
        transportProvider: new FetchTransport(),
        useBatch: false,
        diagnosticProvider: new core.Diagnostic(),
        _userId: 'userIdFromCookies',
      });
    });
  });

  describe('createCookieStorage', () => {
    test('should return custom', async () => {
      const cookieStorage = {
        options: {},
        isEnabled: async () => true,
        get: async () => ({
          optOut: false,
        }),
        set: async () => undefined,
        remove: async () => undefined,
        reset: async () => undefined,
        getRaw: async () => undefined,
      };
      const storage = await Config.createCookieStorage({
        cookieStorage,
      });
      expect(storage).toBe(cookieStorage);
    });

    /*
     * Tested function is only available on web.
     */
    if (isWeb()) {
      test('should return cookies', async () => {
        const storage = await Config.createCookieStorage();
        expect(storage).toBeInstanceOf(BrowserUtils.CookieStorage);
      });
    }

    test('should use return storage', async () => {
      const storage = await Config.createCookieStorage({ disableCookies: true });
      expect(storage).toBeInstanceOf(LocalStorageModule.LocalStorage);
    });

    test('should use memory', async () => {
      const cookiesConstructor = jest.spyOn(BrowserUtils, 'CookieStorage').mockReturnValueOnce({
        options: {},
        isEnabled: async () => false,
        get: async () => '',
        getRaw: async () => '',
        set: async () => undefined,
        remove: async () => undefined,
        reset: async () => undefined,
      });
      const localStorageConstructor = jest.spyOn(LocalStorageModule, 'LocalStorage').mockReturnValueOnce({
        isEnabled: async () => false,
        get: async () => '',
        set: async () => undefined,
        remove: async () => undefined,
        reset: async () => undefined,
        getRaw: async () => undefined,
      });
      const storage = await Config.createCookieStorage();
      expect(storage).toBeInstanceOf(core.MemoryStorage);
      expect(cookiesConstructor).toHaveBeenCalledTimes(1);
      expect(localStorageConstructor).toHaveBeenCalledTimes(1);
    });
  });

  describe('createEventsStorage', () => {
    test('should return custom', async () => {
      const storageProvider = {
        isEnabled: async () => true,
        get: async () => [],
        set: async () => undefined,
        remove: async () => undefined,
        reset: async () => undefined,
        getRaw: async () => undefined,
      };
      const storage = await Config.createEventsStorage({
        storageProvider,
      });
      expect(storage).toBe(storageProvider);
    });

    test('should use return storage', async () => {
      const storage = await Config.createEventsStorage();
      expect(storage).toBeInstanceOf(LocalStorageModule.LocalStorage);
    });

    test('should return undefined storage', async () => {
      const storage = await Config.createEventsStorage({
        storageProvider: undefined,
      });
      expect(storage).toBe(undefined);
    });
  });

  describe('getTopLevelDomain', () => {
    test('should return empty string for localhost', async () => {
      // jest env hostname is localhost
      const domain = await Config.getTopLevelDomain();
      expect(domain).toBe('');
    });

    test('should return empty string if no access to cookies', async () => {
      const testCookieStorage: Storage<number> = {
        isEnabled: () => Promise.resolve(false),
        get: jest.fn().mockResolvedValueOnce(Promise.resolve(1)),
        getRaw: jest.fn().mockResolvedValueOnce(Promise.resolve(1)),
        set: jest.fn().mockResolvedValueOnce(Promise.resolve(undefined)),
        remove: jest.fn().mockResolvedValueOnce(Promise.resolve(undefined)),
        reset: jest.fn().mockResolvedValueOnce(Promise.resolve(undefined)),
      };
      jest.spyOn(BrowserUtils, 'CookieStorage').mockReturnValueOnce({
        ...testCookieStorage,
        options: {},
      });
      const domain = await Config.getTopLevelDomain();
      expect(domain).toBe('');
    });

    test('should return top level domain', async () => {
      const testCookieStorage: Storage<number> = {
        isEnabled: () => Promise.resolve(true),
        get: jest.fn().mockResolvedValueOnce(Promise.resolve(1)),
        getRaw: jest.fn().mockResolvedValueOnce(Promise.resolve(1)),
        set: jest.fn().mockResolvedValueOnce(Promise.resolve(undefined)),
        remove: jest.fn().mockResolvedValueOnce(Promise.resolve(undefined)),
        reset: jest.fn().mockResolvedValueOnce(Promise.resolve(undefined)),
      };
      const actualCookieStorage: Storage<number> = {
        isEnabled: () => Promise.resolve(true),
        get: jest.fn().mockResolvedValueOnce(Promise.resolve(undefined)).mockResolvedValueOnce(Promise.resolve(1)),
        getRaw: jest.fn().mockResolvedValueOnce(Promise.resolve(undefined)).mockResolvedValueOnce(Promise.resolve(1)),
        set: jest.fn().mockResolvedValue(Promise.resolve(undefined)),
        remove: jest.fn().mockResolvedValue(Promise.resolve(undefined)),
        reset: jest.fn().mockResolvedValue(Promise.resolve(undefined)),
      };
      jest
        .spyOn(BrowserUtils, 'CookieStorage')
        .mockReturnValueOnce({
          ...testCookieStorage,
          options: {},
        })
        .mockReturnValue({
          ...actualCookieStorage,
          options: {},
        });
      expect(await Config.getTopLevelDomain('www.legislation.gov.uk')).toBe('.legislation.gov.uk');
    });
  });
});
