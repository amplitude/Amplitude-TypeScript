import {
  Event,
  ReactNativeOptions,
  ReactNativeConfig as IReactNativeConfig,
  Storage,
  ReactNativeTrackingOptions,
  UserSession,
} from '@amplitude/analytics-types';
import { Config, MemoryStorage, UUID } from '@amplitude/analytics-core';
import { CookieStorage, getCookieName, getQueryParams, FetchTransport } from '@amplitude/analytics-client-common';

import { LocalStorage } from './storage/local-storage';
import RemnantDataMigration from './migration/remnant-data-migration';

export const getDefaultConfig = () => {
  const cookieStorage = new MemoryStorage<UserSession>();
  const trackingOptions: Required<ReactNativeTrackingOptions> = {
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
    country: false, // NOTE: tracking country information would disable server-side IP address lookup to fill other information like region, city, dma, etc.
  };
  return {
    cookieExpiration: 365,
    cookieSameSite: 'Lax',
    cookieSecure: false,
    cookieStorage,
    cookieUpgrade: true,
    disableCookies: false,
    domain: '',
    sessionTimeout: 5 * 60 * 1000,
    storageProvider: new MemoryStorage<Event[]>(),
    trackingSessionEvents: false,
    trackingOptions,
    transportProvider: new FetchTransport(),
  };
};

export class ReactNativeConfig extends Config implements IReactNativeConfig {
  appVersion?: string;
  cookieExpiration: number;
  cookieSameSite: string;
  cookieSecure: boolean;
  cookieStorage: Storage<UserSession>;
  cookieUpgrade: boolean;
  disableCookies: boolean;
  domain: string;
  partnerId?: string;
  sessionTimeout: number;
  trackingSessionEvents: boolean;
  trackingOptions: ReactNativeTrackingOptions;

  // NOTE: These protected properties are used to cache values from async storage
  protected _deviceId?: string;
  protected _lastEventId?: number;
  protected _lastEventTime?: number;
  protected _optOut = false;
  protected _sessionId?: number;
  protected _userId?: string;

  constructor(apiKey: string, options?: ReactNativeOptions) {
    const defaultConfig = getDefaultConfig();
    super({
      flushIntervalMillis: 1000,
      flushMaxRetries: 5,
      flushQueueSize: 30,
      transportProvider: defaultConfig.transportProvider,
      ...options,
      apiKey,
    });

    // NOTE: Define `cookieStorage` first to persist user session
    // user session properties expect `cookieStorage` to be defined
    this.cookieStorage = options?.cookieStorage ?? defaultConfig.cookieStorage;
    this.deviceId = options?.deviceId;
    this.lastEventTime = options?.lastEventTime;
    this.optOut = Boolean(options?.optOut);
    this.sessionId = options?.sessionId;
    this.userId = options?.userId;

    this.appVersion = options?.appVersion;
    this.cookieExpiration = options?.cookieExpiration ?? defaultConfig.cookieExpiration;
    this.cookieSameSite = options?.cookieSameSite ?? defaultConfig.cookieSameSite;
    this.cookieSecure = options?.cookieSecure ?? defaultConfig.cookieSecure;
    this.cookieUpgrade = options?.cookieUpgrade ?? defaultConfig.cookieUpgrade;
    this.disableCookies = options?.disableCookies ?? defaultConfig.disableCookies;
    this.domain = options?.domain ?? defaultConfig.domain;
    this.partnerId = options?.partnerId;
    this.sessionTimeout = options?.sessionTimeout ?? defaultConfig.sessionTimeout;
    this.trackingOptions = options?.trackingOptions ?? defaultConfig.trackingOptions;
    this.trackingSessionEvents = options?.trackingSessionEvents ?? defaultConfig.trackingSessionEvents;
  }

  get deviceId() {
    return this._deviceId;
  }

  set deviceId(deviceId: string | undefined) {
    if (this._deviceId !== deviceId) {
      this._deviceId = deviceId;
      this.updateStorage();
    }
  }

  get userId() {
    return this._userId;
  }

  set userId(userId: string | undefined) {
    if (this._userId !== userId) {
      this._userId = userId;
      this.updateStorage();
    }
  }

  get sessionId() {
    return this._sessionId;
  }

  set sessionId(sessionId: number | undefined) {
    if (this._sessionId !== sessionId) {
      this._sessionId = sessionId;
      this.updateStorage();
    }
  }

  get optOut() {
    return this._optOut;
  }

  set optOut(optOut: boolean) {
    if (this._optOut !== optOut) {
      this._optOut = optOut;
      this.updateStorage();
    }
  }

  get lastEventTime() {
    return this._lastEventTime;
  }

  set lastEventTime(lastEventTime: number | undefined) {
    if (this._lastEventTime !== lastEventTime) {
      this._lastEventTime = lastEventTime;
      this.updateStorage();
    }
  }

  get lastEventId() {
    return this._lastEventId;
  }

  set lastEventId(lastEventId: number | undefined) {
    if (this._lastEventId !== lastEventId) {
      this._lastEventId = lastEventId;
      this.updateStorage();
    }
  }

  private updateStorage() {
    const cache = {
      deviceId: this._deviceId,
      userId: this._userId,
      sessionId: this._sessionId,
      optOut: this._optOut,
      lastEventTime: this._lastEventTime,
      lastEventId: this._lastEventId,
    };
    void this.cookieStorage?.set(getCookieName(this.apiKey), cache);
  }
}

export const useReactNativeConfig = async (
  apiKey: string,
  options?: ReactNativeOptions,
): Promise<IReactNativeConfig> => {
  const defaultConfig = getDefaultConfig();

  // create cookie storage
  const domain = options?.disableCookies ? '' : options?.domain ?? (await getTopLevelDomain());
  const cookieStorage = await createCookieStorage<UserSession>({ ...options, domain });
  const previousCookies = await cookieStorage.get(getCookieName(apiKey));
  const queryParams = getQueryParams();

  // reconcile user session
  let deviceId = options?.deviceId ?? queryParams.deviceId ?? previousCookies?.deviceId;
  let lastEventTime = options?.lastEventTime ?? previousCookies?.lastEventTime;
  const optOut = options?.optOut ?? Boolean(previousCookies?.optOut);
  let sessionId = options?.sessionId ?? previousCookies?.sessionId;
  let userId = options?.userId ?? previousCookies?.userId;
  let lastEventId = previousCookies?.lastEventId;

  const storageProvider = options?.storageProvider ?? (await createEventsStorage(options));

  if (options?.migrateLegacyData !== false) {
    const legacySessionData = await new RemnantDataMigration(
      apiKey,
      options?.instanceName,
      storageProvider,
      previousCookies?.lastEventTime === undefined,
      options?.loggerProvider,
    ).execute();
    deviceId = deviceId ?? legacySessionData.deviceId;
    userId = userId ?? legacySessionData.userId;
    sessionId = sessionId ?? legacySessionData.sessionId;
    lastEventTime = lastEventTime ?? legacySessionData.lastEventTime;
    lastEventId = lastEventId ?? legacySessionData.lastEventId;
  }

  const config = new ReactNativeConfig(apiKey, {
    ...options,
    cookieStorage,
    deviceId: deviceId ?? UUID(),
    domain,
    lastEventTime,
    optOut,
    sessionId,
    storageProvider,
    trackingOptions: {
      ...defaultConfig.trackingOptions,
      ...options?.trackingOptions,
    },
    transportProvider: options?.transportProvider ?? new FetchTransport(),
    userId,
  });

  config.lastEventId = lastEventId;

  config.loggerProvider?.log(
    `Init: storage=${cookieStorage.constructor.name} restoredSessionId = ${
      previousCookies?.sessionId ?? 'undefined'
    }, optionsSessionId = ${options?.sessionId ?? 'undefined'}`,
  );

  return config;
};

export const createCookieStorage = async <T>(
  overrides?: ReactNativeOptions,
  baseConfig = getDefaultConfig(),
): Promise<Storage<T>> => {
  const options = { ...baseConfig, ...overrides };
  const cookieStorage = overrides?.cookieStorage as Storage<T>;
  if (!cookieStorage || !(await cookieStorage.isEnabled())) {
    return createFlexibleStorage<T>(options);
  }
  return cookieStorage;
};

const createFlexibleStorage = async <T>(options: ReactNativeOptions): Promise<Storage<T>> => {
  let storage: Storage<T> = new CookieStorage({
    domain: options.domain,
    expirationDays: options.cookieExpiration,
    sameSite: options.cookieSameSite,
    secure: options.cookieSecure,
  });
  if (options.disableCookies || !(await storage.isEnabled())) {
    storage = new LocalStorage();
    if (!(await storage.isEnabled())) {
      storage = new MemoryStorage();
    }
  }
  return storage;
};

export const createEventsStorage = async (overrides?: ReactNativeOptions): Promise<Storage<Event[]> | undefined> => {
  const hasStorageProviderProperty = overrides && Object.prototype.hasOwnProperty.call(overrides, 'storageProvider');
  // If storageProperty is explicitly undefined like `{ storageProperty: undefined }`
  // then storageProvider is undefined
  // If storageProvider is implicitly undefined like `{ }`
  // then storageProvider is LocalStorage
  // Otherwise storageProvider is overriden
  if (!hasStorageProviderProperty || overrides.storageProvider) {
    for (const storage of [overrides?.storageProvider, new LocalStorage<Event[]>()]) {
      if (storage && (await storage.isEnabled())) {
        return storage;
      }
    }
  }
  return undefined;
};

export const getTopLevelDomain = async (url?: string) => {
  if (
    !(await new CookieStorage<number>().isEnabled()) ||
    (!url && (typeof location === 'undefined' || !location.hostname))
  ) {
    return '';
  }

  const host = url ?? location.hostname;
  const parts = host.split('.');
  const levels = [];
  const storageKey = 'AMP_TLDTEST';

  for (let i = parts.length - 2; i >= 0; --i) {
    levels.push(parts.slice(i).join('.'));
  }
  for (let i = 0; i < levels.length; i++) {
    const domain = levels[i];
    const options = { domain: '.' + domain };
    const storage = new CookieStorage<number>(options);
    await storage.set(storageKey, 1);
    const value = await storage.get(storageKey);
    if (value) {
      await storage.remove(storageKey);
      return '.' + domain;
    }
  }

  return '';
};
