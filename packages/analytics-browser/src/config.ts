import {
  AttributionOptions,
  Event,
  BrowserOptions,
  BrowserConfig as IBrowserConfig,
  DefaultTrackingOptions,
  Storage,
  TrackingOptions,
  TransportType,
  UserSession,
} from '@amplitude/analytics-types';
import { Config, MemoryStorage, UUID } from '@amplitude/analytics-core';
import { CookieStorage, getCookieName, FetchTransport } from '@amplitude/analytics-client-common';

import { LocalStorage } from './storage/local-storage';
import { XHRTransport } from './transports/xhr';
import { SendBeaconTransport } from './transports/send-beacon';

export const getDefaultConfig = () => {
  const cookieStorage = new MemoryStorage<UserSession>();
  const trackingOptions: Required<TrackingOptions> = {
    deviceManufacturer: true,
    deviceModel: true,
    ipAddress: true,
    language: true,
    osName: true,
    osVersion: true,
    platform: true,
  };
  return {
    cookieExpiration: 365,
    cookieSameSite: 'Lax',
    cookieSecure: false,
    cookieStorage,
    cookieUpgrade: true,
    disableCookies: false,
    domain: '',
    sessionTimeout: 30 * 60 * 1000,
    trackingOptions,
    transportProvider: new FetchTransport(),
  };
};

export class BrowserConfig extends Config implements IBrowserConfig {
  appVersion?: string;
  attribution?: AttributionOptions;
  cookieExpiration: number;
  cookieSameSite: string;
  cookieSecure: boolean;
  cookieUpgrade: boolean;
  cookieStorage: Storage<UserSession>;
  defaultTracking?: DefaultTrackingOptions | boolean;
  disableCookies: boolean;
  domain: string;
  partnerId?: string;
  sessionTimeout: number;
  trackingOptions: TrackingOptions;

  // NOTE: These protected properties are used to cache values from async storage
  protected _deviceId?: string;
  protected _lastEventId?: number;
  protected _lastEventTime?: number;
  protected _optOut = false;
  protected _sessionId?: number;
  protected _userId?: string;

  constructor(apiKey: string, options?: BrowserOptions) {
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
    this.lastEventId = options?.lastEventId;
    this.lastEventTime = options?.lastEventTime;
    this.optOut = Boolean(options?.optOut);
    this.sessionId = options?.sessionId;
    this.userId = options?.userId;

    this.appVersion = options?.appVersion;
    this.attribution = options?.attribution;
    this.cookieExpiration = options?.cookieExpiration ?? defaultConfig.cookieExpiration;
    this.cookieSameSite = options?.cookieSameSite ?? defaultConfig.cookieSameSite;
    this.cookieSecure = options?.cookieSecure ?? defaultConfig.cookieSecure;
    this.cookieUpgrade = options?.cookieUpgrade ?? defaultConfig.cookieUpgrade;
    this.defaultTracking = options?.defaultTracking;
    this.disableCookies = options?.disableCookies ?? defaultConfig.disableCookies;
    this.defaultTracking = options?.defaultTracking;
    this.domain = options?.domain ?? defaultConfig.domain;
    this.partnerId = options?.partnerId;
    this.sessionTimeout = options?.sessionTimeout ?? defaultConfig.sessionTimeout;
    this.trackingOptions = options?.trackingOptions ?? defaultConfig.trackingOptions;
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

export const useBrowserConfig = async (apiKey: string, options?: BrowserOptions): Promise<IBrowserConfig> => {
  const defaultConfig = getDefaultConfig();

  // reconcile user session
  const deviceId = options?.deviceId ?? UUID();
  const lastEventId = options?.lastEventId;
  const lastEventTime = options?.lastEventTime;
  const optOut = options?.optOut;
  const sessionId = options?.sessionId;
  const userId = options?.userId;
  const cookieStorage = options?.cookieStorage;
  const domain = options?.domain;

  return new BrowserConfig(apiKey, {
    ...options,
    cookieStorage,
    deviceId,
    domain,
    lastEventId,
    lastEventTime,
    optOut,
    sessionId,
    storageProvider: await createEventsStorage(options),
    trackingOptions: {
      ...defaultConfig.trackingOptions,
      ...options?.trackingOptions,
    },
    transportProvider: options?.transportProvider ?? createTransport(options?.transport),
    userId,
  });
};

export const createCookieStorage = async <T>(
  overrides?: BrowserOptions,
  baseConfig = getDefaultConfig(),
): Promise<Storage<T>> => {
  const options = { ...baseConfig, ...overrides };
  const cookieStorage = overrides?.cookieStorage as Storage<T>;
  if (!cookieStorage || !(await cookieStorage.isEnabled())) {
    return createFlexibleStorage<T>(options);
  }
  return cookieStorage;
};

const createFlexibleStorage = async <T>(options: BrowserOptions): Promise<Storage<T>> => {
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

export const createEventsStorage = async (overrides?: BrowserOptions): Promise<Storage<Event[]> | undefined> => {
  const hasStorageProviderProperty = overrides && Object.prototype.hasOwnProperty.call(overrides, 'storageProvider');
  // If storageProperty is explicitly undefined `{ storageProperty: undefined }`
  // then storageProvider is undefined
  // If storageProvider is implicitly undefined `{ }`
  // then storageProvider is LocalStorage
  // Otherwise storageProvider is overriden
  const loggerProvider = overrides && overrides.loggerProvider;
  if (!hasStorageProviderProperty || overrides.storageProvider) {
    for (const storage of [overrides?.storageProvider, new LocalStorage<Event[]>({ loggerProvider: loggerProvider })]) {
      if (storage && (await storage.isEnabled())) {
        return storage;
      }
    }
  }
  return undefined;
};

export const createTransport = (transport?: TransportType | keyof typeof TransportType) => {
  if (transport === TransportType.XHR) {
    return new XHRTransport();
  }
  if (transport === TransportType.SendBeacon) {
    return new SendBeaconTransport();
  }
  return getDefaultConfig().transportProvider;
};

export const getTopLevelDomain = async (url?: string) => {
  if (!(await new CookieStorage<number>().isEnabled()) || (!url && typeof location === 'undefined')) {
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
