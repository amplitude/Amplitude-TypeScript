import * as Config from '../src/config';
import * as LocalStorageModule from '../src/storage/local-storage';
import * as core from '@amplitude/analytics-core';
import { LogLevel, Storage, TransportType, UserSession } from '@amplitude/analytics-types';
import * as BrowserUtils from '@amplitude/analytics-client-common';
import { getCookieName, FetchTransport } from '@amplitude/analytics-client-common';
import { XHRTransport } from '../src/transports/xhr';
import { createTransport } from '../src/config';
import { SendBeaconTransport } from '../src/transports/send-beacon';
import { uuidPattern } from './helpers/constants';

describe('config', () => {
  const someUUID: string = expect.stringMatching(uuidPattern) as string;
  const someStorage: core.MemoryStorage<UserSession> = expect.any(
    core.MemoryStorage,
  ) as core.MemoryStorage<UserSession>;

  const API_KEY = 'apiKey';

  describe('BrowserConfig', () => {
    test('should create plain config', async () => {
      const cookieStorage = new core.MemoryStorage<UserSession>();
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = new Config.BrowserConfig('');
      expect(config).toEqual({
        apiKey: '',
        appVersion: undefined,
        attribution: undefined,
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
        sessionTimeout: 1800000,
        trackingOptions: {
          deviceManufacturer: true,
          deviceModel: true,
          ipAddress: true,
          language: true,
          osName: true,
          osVersion: true,
          platform: true,
        },
        transportProvider: new FetchTransport(),
        useBatch: false,
      });
    });
  });

  describe('useBrowserConfig', () => {
    test('should create default config', async () => {
      jest.spyOn(Config, 'createEventsStorage').mockResolvedValueOnce(new core.MemoryStorage());
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = await Config.useBrowserConfig(API_KEY);
      expect(config).toEqual({
        apiKey: API_KEY,
        appVersion: undefined,
        attribution: undefined,
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
        sessionTimeout: 1800000,
        storageProvider: new core.MemoryStorage(),
        trackingOptions: {
          deviceManufacturer: true,
          deviceModel: true,
          ipAddress: true,
          language: true,
          osName: true,
          osVersion: true,
          platform: true,
        },
        transportProvider: new FetchTransport(),
        useBatch: false,
      });
    });

    test('should create using cookies/overwrite', async () => {
      const cookieStorage = new core.MemoryStorage<UserSession>();
      await cookieStorage.set(getCookieName(API_KEY), {
        deviceId: 'device-device-device',
        sessionId: -1,
        userId: 'user-user-user',
        lastEventId: 100,
        lastEventTime: 1,
        optOut: false,
      });
      jest.spyOn(Config, 'createEventsStorage').mockResolvedValueOnce(new core.MemoryStorage());
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = await Config.useBrowserConfig(API_KEY, {
        deviceId: 'device-device-device',
        sessionId: -1,
        userId: 'user-user-user',
        lastEventId: 100,
        lastEventTime: 1,
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
        _deviceId: 'device-device-device',
        disableCookies: true,
        domain: '',
        flushIntervalMillis: 1000,
        flushMaxRetries: 5,
        flushQueueSize: 30,
        instanceName: '$default_instance',
        _lastEventId: 100,
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
        trackingOptions: {
          deviceManufacturer: true,
          deviceModel: true,
          ipAddress: true,
          language: true,
          osName: true,
          osVersion: true,
          platform: true,
        },
        transportProvider: new FetchTransport(),
        useBatch: false,
        _userId: 'user-user-user',
      });
    });

    test('should use custom domain', async () => {
      const config = await Config.useBrowserConfig(API_KEY, {
        domain: 'amplitude.com',
      });
      expect(config.domain).toEqual('amplitude.com');
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

    test('should return cookies', async () => {
      const storage = await Config.createCookieStorage();
      expect(storage).toBeInstanceOf(BrowserUtils.CookieStorage);
    });

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
