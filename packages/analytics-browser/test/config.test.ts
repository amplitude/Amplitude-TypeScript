import * as Config from '../src/config';
import * as LocalStorageModule from '../src/storage/local-storage';
import * as SessionStorageModule from '../src/storage/session-storage';
import * as core from '@amplitude/analytics-core';
import {
  LogLevel,
  Storage,
  UserSession,
  MemoryStorage,
  getCookieName,
  FetchTransport,
  Logger,
  BrowserConfig,
} from '@amplitude/analytics-core';
import * as BrowserUtils from '@amplitude/analytics-core';
import { XHRTransport } from '../src/transports/xhr';
import { createTransport, useBrowserConfig, shouldFetchRemoteConfig } from '../src/config';
import { SendBeaconTransport } from '../src/transports/send-beacon';
import { uuidPattern } from './helpers/constants';
import { DEFAULT_IDENTITY_STORAGE, DEFAULT_SERVER_ZONE } from '../src/constants';
import { AmplitudeBrowser } from '../src/browser-client';
import { VERSION } from '../src/version';

describe('config', () => {
  const someUUID: string = expect.stringMatching(uuidPattern) as string;
  const someCookieStorage: BrowserUtils.CookieStorage<UserSession> = expect.any(
    BrowserUtils.CookieStorage,
  ) as BrowserUtils.CookieStorage<UserSession>;
  const someLocalStorage: LocalStorageModule.LocalStorage<UserSession> = expect.any(
    LocalStorageModule.LocalStorage,
  ) as LocalStorageModule.LocalStorage<UserSession>;

  let apiKey = '';

  beforeEach(() => {
    apiKey = core.UUID();
  });

  describe('BrowserConfig', () => {
    test('should create empty config', async () => {
      const config = new Config.BrowserConfig(apiKey);
      expect(config).toMatchObject({
        _cookieStorage: expect.any(MemoryStorage),
        _optOut: false,
        apiKey,
        appVersion: undefined,
        cookieOptions: {
          domain: '',
          expiration: 365,
          sameSite: 'Lax',
          secure: false,
          upgrade: true,
        },
        defaultTracking: undefined,
        identityStorage: DEFAULT_IDENTITY_STORAGE,
        flushIntervalMillis: 1000,
        flushMaxRetries: 5,
        flushQueueSize: 30,
        loggerProvider: expect.any(Logger),
        logLevel: LogLevel.Warn,
        minIdLength: undefined,
        offline: false,
        partnerId: undefined,
        plan: undefined,
        ingestionMetadata: undefined,
        serverUrl: '',
        serverZone: DEFAULT_SERVER_ZONE,
        sessionTimeout: 1800000,
        storageProvider: expect.any(LocalStorageModule.LocalStorage),
        trackingOptions: {
          ipAddress: true,
          language: true,
          platform: true,
        },
        transport: 'fetch',
        transportProvider: expect.any(FetchTransport),
        useBatch: false,
        fetchRemoteConfig: true,
        version: VERSION,
        enableDiagnostics: true,
        diagnosticsSampleRate: 0,
        diagnosticsClient: undefined,
        remoteConfig: {
          fetchRemoteConfig: true,
        },
      });
    });

    test('shoud return _optOut', () => {
      const config = new Config.BrowserConfig(apiKey);
      expect(config.optOut).toBe(false);
    });

    test('should default fetchRemoteConfig to true when both remoteConfig.fetchRemoteConfig and fetchRemoteConfig are undefined', () => {
      // Pass undefined for fetchRemoteConfig to test the ?? true fallback on line 129
      const config = new Config.BrowserConfig(apiKey);
      expect(config.fetchRemoteConfig).toBe(true);
      expect(config.remoteConfig?.fetchRemoteConfig).toBe(true);
    });
  });

  describe('useBrowserConfig', () => {
    test('should create default config', async () => {
      const getTopLevelDomain = jest.spyOn(Config, 'getTopLevelDomain').mockResolvedValueOnce('.amplitude.com');
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      const config = await Config.useBrowserConfig(apiKey, undefined, new AmplitudeBrowser());
      expect(config).toEqual({
        _cookieStorage: someCookieStorage,
        _deviceId: someUUID,
        _lastEventId: undefined,
        _lastEventTime: undefined,
        _optOut: false,
        _sessionId: undefined,
        _userId: undefined,
        apiKey,
        appVersion: undefined,
        cookieOptions: {
          domain: '.amplitude.com',
          expiration: 365,
          sameSite: 'Lax',
          secure: false,
          upgrade: true,
        },
        defaultTracking: undefined,
        identityStorage: DEFAULT_IDENTITY_STORAGE,
        flushIntervalMillis: 1000,
        flushMaxRetries: 5,
        flushQueueSize: 30,
        loggerProvider: logger,
        logLevel: LogLevel.Warn,
        minIdLength: undefined,
        offline: false,
        partnerId: undefined,
        plan: undefined,
        ingestionMetadata: undefined,
        serverUrl: '',
        serverZone: DEFAULT_SERVER_ZONE,
        sessionTimeout: 1800000,
        storageProvider: someLocalStorage,
        trackingOptions: {
          ipAddress: true,
          language: true,
          platform: true,
        },
        transport: 'fetch',
        transportProvider: new FetchTransport(),
        useBatch: false,
        fetchRemoteConfig: true,
        version: VERSION,
        enableDiagnostics: true,
        diagnosticsSampleRate: 0,
        diagnosticsClient: undefined,
        remoteConfig: {
          fetchRemoteConfig: true,
        },
      });
      expect(getTopLevelDomain).toHaveBeenCalledTimes(1);
    });

    test('should fall back to memoryStorage when storageProvider is not enabled', async () => {
      const localStorageIsEnabledSpy = jest
        .spyOn(LocalStorageModule.LocalStorage.prototype, 'isEnabled')
        .mockResolvedValueOnce(false);
      const loggerProviderSpy = jest.spyOn(core.Logger.prototype, 'warn');
      const config = await Config.useBrowserConfig(apiKey, undefined, new AmplitudeBrowser());
      expect(localStorageIsEnabledSpy).toHaveBeenCalledTimes(1);
      expect(loggerProviderSpy).toHaveBeenCalledWith(
        'Storage provider LocalStorage is not enabled. Falling back to MemoryStorage.',
      );
      expect(config.storageProvider).toEqual(expect.any(MemoryStorage));
    });

    test('should create using cookies/overwrite', async () => {
      const cookieStorage = new core.MemoryStorage<UserSession>();
      await cookieStorage.set(getCookieName(apiKey), {
        deviceId: 'device-device-device',
        sessionId: -1,
        userId: 'user-user-user',
        lastEventId: 100,
        lastEventTime: 1,
        optOut: false,
      });
      const logger = new core.Logger();
      logger.enable(LogLevel.Warn);
      jest.spyOn(Config, 'createCookieStorage').mockReturnValueOnce(cookieStorage);
      const config = await Config.useBrowserConfig(
        apiKey,
        {
          deviceId: 'device-device-device',
          sessionId: -1,
          userId: 'user-user-user',
          partnerId: 'partnerId',
          plan: {
            version: '0',
          },
          ingestionMetadata: {
            sourceName: 'ampli',
            sourceVersion: '2.0.0',
          },
          sessionTimeout: 1,
          cookieOptions: {
            domain: '.amplitude.com',
            upgrade: false,
          },
          defaultTracking: true,
          offline: true,
        },
        new AmplitudeBrowser(),
      );
      expect(config).toEqual({
        _cookieStorage: expect.any(MemoryStorage),
        _deviceId: 'device-device-device',
        _lastEventId: 100,
        _lastEventTime: 1,
        _optOut: false,
        _sessionId: -1,
        _userId: 'user-user-user',
        apiKey,
        appVersion: undefined,
        cookieOptions: {
          domain: '.amplitude.com',
          expiration: 365,
          sameSite: 'Lax',
          secure: false,
          upgrade: false,
        },
        defaultTracking: true,
        flushIntervalMillis: 1000,
        flushMaxRetries: 5,
        flushQueueSize: 30,
        identityStorage: DEFAULT_IDENTITY_STORAGE,
        ingestionMetadata: {
          sourceName: 'ampli',
          sourceVersion: '2.0.0',
        },
        logLevel: 2,
        loggerProvider: logger,
        minIdLength: undefined,
        offline: true,
        partnerId: 'partnerId',
        plan: {
          version: '0',
        },
        serverUrl: '',
        serverZone: DEFAULT_SERVER_ZONE,
        sessionTimeout: 1,
        storageProvider: someLocalStorage,
        trackingOptions: {
          ipAddress: true,
          language: true,
          platform: true,
        },
        transport: 'fetch',
        transportProvider: expect.any(FetchTransport),
        useBatch: false,
        fetchRemoteConfig: true,
        version: VERSION,
        enableDiagnostics: true,
        diagnosticsSampleRate: 0,
        diagnosticsClient: undefined,
        remoteConfig: {
          fetchRemoteConfig: true,
        },
      });
    });

    test('should change storage', async () => {
      const config = await Config.useBrowserConfig(
        apiKey,
        {
          userId: 'user@amplitude.com',
        },
        new AmplitudeBrowser(),
      );
      expect(config.cookieStorage).toEqual(someCookieStorage);
      const cookie1 = await config.cookieStorage.get(getCookieName(apiKey));
      expect(cookie1?.userId).toEqual('user@amplitude.com');
      config.cookieStorage = new LocalStorageModule.LocalStorage();
      expect(config.cookieStorage).toEqual(someLocalStorage);
      const cookie2 = await config.cookieStorage.get(getCookieName(apiKey));
      expect(cookie2?.userId).toEqual('user@amplitude.com');
    });

    test('should use custom domain', async () => {
      const config = await Config.useBrowserConfig(
        apiKey,
        {
          cookieOptions: {
            domain: 'amplitude.com',
          },
        },
        new AmplitudeBrowser(),
      );
      expect(config.cookieOptions?.domain).toEqual('amplitude.com');
    });

    test.each([
      [true, true],
      [undefined, true],
      [false, false],
    ])('should use trackingOptions', async (input, expected) => {
      const config = await Config.useBrowserConfig(
        apiKey,
        {
          trackingOptions: {
            ipAddress: input,
            language: input,
            platform: input,
          },
        },
        new AmplitudeBrowser(),
      );
      expect(config.trackingOptions.ipAddress).toEqual(expected);
      expect(config.trackingOptions.language).toEqual(expected);
      expect(config.trackingOptions.platform).toEqual(expected);
    });
  });

  describe('createCookieStorage', () => {
    test('should return cookies', async () => {
      const storage = Config.createCookieStorage(DEFAULT_IDENTITY_STORAGE);
      expect(storage).toBeInstanceOf(BrowserUtils.CookieStorage);
    });

    test('should use return storage', async () => {
      const storage = Config.createCookieStorage('localStorage');
      expect(storage).toBeInstanceOf(LocalStorageModule.LocalStorage);
    });

    test('should use return session storage', async () => {
      const storage = Config.createCookieStorage('sessionStorage');
      expect(storage).toBeInstanceOf(SessionStorageModule.SessionStorage);
    });

    test('should use memory', async () => {
      const storage = Config.createCookieStorage('none');
      expect(storage).toBeInstanceOf(core.MemoryStorage);
    });
  });

  describe('createTransport', () => {
    test('should return xhr', () => {
      expect(createTransport('xhr')).toBeInstanceOf(XHRTransport);
    });

    test('should return beacon', () => {
      expect(createTransport('beacon')).toBeInstanceOf(SendBeaconTransport);
    });

    test('should return fetch', () => {
      expect(createTransport('fetch')).toBeInstanceOf(FetchTransport);
    });

    test('should return fetch when undefined', () => {
      expect(createTransport()).toBeInstanceOf(FetchTransport);
    });

    test('should return xhr with object format', () => {
      expect(createTransport({ type: 'xhr' })).toBeInstanceOf(XHRTransport);
    });

    test('should return beacon with object format', () => {
      expect(createTransport({ type: 'beacon' })).toBeInstanceOf(SendBeaconTransport);
    });

    test('should return fetch with object format', () => {
      expect(createTransport({ type: 'fetch' })).toBeInstanceOf(FetchTransport);
    });

    test('should return fetch when object format has only headers', () => {
      expect(createTransport({ headers: { Authorization: 'Bearer token' } })).toBeInstanceOf(FetchTransport);
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
        config: {},
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
          config: {},
        })
        .mockReturnValue({
          ...actualCookieStorage,
          options: {},
          config: {},
        });
      expect(await Config.getTopLevelDomain('www.legislation.gov.uk')).toBe('.legislation.gov.uk');
    });

    test('should not throw an error when location is an empty object', async () => {
      const originalLocation = window.location;

      Object.defineProperty(window, 'location', {
        value: {} as Location,
        configurable: true,
      });

      expect(await Config.getTopLevelDomain()).toBe('');

      Object.defineProperty(window, 'location', {
        value: originalLocation,
        configurable: true,
      });
    });

    test('should return empty string when location is undefined', async () => {
      const originalLocation = window.location;

      Object.defineProperty(window, 'location', {
        value: undefined,
        configurable: true,
      });

      expect(await Config.getTopLevelDomain()).toBe('');

      Object.defineProperty(window, 'location', {
        value: originalLocation,
        configurable: true,
      });
    });
  });

  describe('fetchRemoteConfig', () => {
    test('should set remoteConfig.fetchRemoteConfig to true when remoteConfig.fetchRemoteConfig true', async () => {
      const instance = new AmplitudeBrowser();
      const config = await useBrowserConfig(
        apiKey,
        {
          fetchRemoteConfig: false,
          remoteConfig: {
            fetchRemoteConfig: true,
          },
        },
        instance,
      );
      expect(config.remoteConfig?.fetchRemoteConfig).toBe(true);
    });

    test('should set remoteConfig.fetchRemoteConfig to true when remoteConfig.fetchRemoteConfig is false', async () => {
      const instance = new AmplitudeBrowser();
      const config = await useBrowserConfig(
        apiKey,
        {
          remoteConfig: {
            fetchRemoteConfig: false,
          },
        },
        instance,
      );
      expect(config.remoteConfig?.fetchRemoteConfig).toBe(false);
    });
  });

  describe('duplicateResolverFn', () => {
    const encodeJson = (session: UserSession) => btoa(encodeURIComponent(JSON.stringify(session)));

    let config: BrowserConfig;
    let cookieStorage: BrowserUtils.CookieStorage<UserSession>;
    let duplicateResolverFn: ((value: string) => boolean) | undefined;

    beforeEach(async () => {
      config = await Config.useBrowserConfig(
        apiKey,
        { cookieOptions: { domain: '.amplitude.com' } },
        new AmplitudeBrowser(),
      );
      cookieStorage = config.cookieStorage as BrowserUtils.CookieStorage<UserSession>;
      duplicateResolverFn = cookieStorage.config.duplicateResolverFn;
    });

    test('should return true when cookieDomain matches config domain', async () => {
      expect(duplicateResolverFn?.(encodeJson({ optOut: false, cookieDomain: '.amplitude.com' }))).toBe(true);
    });

    test('should return false when cookieDomain does not match config domain', async () => {
      expect(duplicateResolverFn?.(encodeJson({ optOut: false, cookieDomain: '.other.com' }))).toBe(false);
    });

    test('should return false when cookieDomain is not set', async () => {
      expect(duplicateResolverFn?.(encodeJson({ optOut: false }))).toBe(false);
    });

    test('should return false when cookie value cannot be decoded', async () => {
      expect(duplicateResolverFn?.('not-valid-base64!')).toBe(false);
    });
  });

  describe('shouldFetchRemoteConfig', () => {
    test('should return true when remoteConfig.fetchRemoteConfig is explicitly true', () => {
      expect(shouldFetchRemoteConfig({ remoteConfig: { fetchRemoteConfig: true } })).toBe(true);
    });

    test('should return false when remoteConfig.fetchRemoteConfig is explicitly false', () => {
      expect(shouldFetchRemoteConfig({ remoteConfig: { fetchRemoteConfig: false } })).toBe(false);
    });

    test('should return false when fetchRemoteConfig is explicitly false', () => {
      expect(shouldFetchRemoteConfig({ fetchRemoteConfig: false })).toBe(false);
    });

    test('should return true when both are undefined (default behavior)', () => {
      expect(shouldFetchRemoteConfig({})).toBe(true);
    });

    test('should return true when options is undefined', () => {
      expect(shouldFetchRemoteConfig()).toBe(true);
    });
  });

  describe('useBrowserConfig with earlyConfig', () => {
    test('should use earlyConfig values when provided', async () => {
      const customLogger = new core.Logger();
      customLogger.enable(LogLevel.Debug);

      const earlyConfig: Config.EarlyConfig = {
        loggerProvider: customLogger,
        serverZone: 'EU',
        enableDiagnostics: false,
        diagnosticsSampleRate: 0.5,
      };

      const config = await Config.useBrowserConfig(
        apiKey,
        {}, // Empty options to ensure earlyConfig values are used
        new AmplitudeBrowser(),
        undefined, // diagnosticsClient
        earlyConfig,
      );

      // Verify earlyConfig values are used instead of defaults
      expect(config.loggerProvider).toBe(customLogger);
      expect(config.serverZone).toBe('EU');
      expect(config.enableDiagnostics).toBe(false);
      expect(config.diagnosticsSampleRate).toBe(0.5);
    });
  });
});
