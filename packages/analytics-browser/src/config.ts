import {
  Event,
  BrowserOptions,
  BrowserConfig as IBrowserConfig,
  Storage,
  TrackingOptions,
  TransportType,
  UserSession,
  SessionManager as ISessionManager,
} from '@amplitude/analytics-types';
import { Config, MemoryStorage, UUID } from '@amplitude/analytics-core';

import { CookieStorage } from './storage/cookie';
import { FetchTransport } from './transports/fetch';
import { LocalStorage } from './storage/local-storage';
import { getCookieName } from './utils/cookie-name';
import { getQueryParams } from './utils/query-params';
import { XHRTransport } from './transports/xhr';
import { SendBeaconTransport } from './transports/send-beacon';
import { SessionManager } from './session-manager';

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
    disableCookies: false,
    domain: '',
    sessionManager: new SessionManager(cookieStorage, ''),
    sessionTimeout: 30 * 60 * 1000,
    storageProvider: new MemoryStorage<Event[]>(),
    trackingOptions,
    transportProvider: new FetchTransport(),
  };
};

export class BrowserConfig extends Config implements IBrowserConfig {
  appVersion?: string;
  cookieExpiration: number;
  cookieSameSite: string;
  cookieSecure: boolean;
  cookieStorage: Storage<UserSession>;
  disableCookies: boolean;
  domain: string;
  partnerId?: string;
  sessionTimeout: number;
  trackingOptions: TrackingOptions;
  sessionManager: ISessionManager;

  constructor(apiKey: string, userId?: string, options?: BrowserOptions) {
    const defaultConfig = getDefaultConfig();
    super({
      flushIntervalMillis: 1000,
      flushMaxRetries: 5,
      flushQueueSize: 30,
      ...options,
      apiKey,
      storageProvider: options?.storageProvider ?? defaultConfig.storageProvider,
      transportProvider: options?.transportProvider ?? defaultConfig.transportProvider,
    });
    this.cookieStorage = options?.cookieStorage ?? defaultConfig.cookieStorage;
    this.sessionManager = options?.sessionManager ?? defaultConfig.sessionManager;
    this.sessionTimeout = options?.sessionTimeout ?? defaultConfig.sessionTimeout;

    this.appVersion = options?.appVersion;
    this.cookieExpiration = options?.cookieExpiration ?? defaultConfig.cookieExpiration;
    this.cookieSameSite = options?.cookieSameSite ?? defaultConfig.cookieSameSite;
    this.cookieSecure = options?.cookieSecure ?? defaultConfig.cookieSecure;
    this.deviceId = options?.deviceId;
    this.disableCookies = options?.disableCookies ?? defaultConfig.disableCookies;
    this.domain = options?.domain ?? defaultConfig.domain;
    this.lastEventTime = this.lastEventTime ?? options?.lastEventTime;
    this.optOut = Boolean(options?.optOut);
    this.partnerId = options?.partnerId;
    this.sessionId = options?.sessionId;
    this.trackingOptions = options?.trackingOptions ?? defaultConfig.trackingOptions;
    this.userId = userId;
  }

  get deviceId() {
    return this.sessionManager.getDeviceId();
  }

  set deviceId(deviceId: string | undefined) {
    this.sessionManager.setDeviceId(deviceId);
  }

  get userId() {
    return this.sessionManager.getUserId();
  }

  set userId(userId: string | undefined) {
    this.sessionManager.setUserId(userId);
  }

  get sessionId() {
    return this.sessionManager.getSessionId();
  }

  set sessionId(sessionId: number | undefined) {
    this.sessionManager.setSessionId(sessionId);
  }

  get optOut() {
    return this.sessionManager.getOptOut();
  }

  set optOut(optOut: boolean) {
    this.sessionManager?.setOptOut(Boolean(optOut));
  }

  get lastEventTime() {
    return this.sessionManager.getLastEventTime();
  }

  set lastEventTime(lastEventTime: number | undefined) {
    this.sessionManager.setLastEventTime(lastEventTime);
  }
}

export const useBrowserConfig = async (
  apiKey: string,
  userId?: string,
  options?: BrowserOptions,
): Promise<IBrowserConfig> => {
  const defaultConfig = getDefaultConfig();
  const domain = options?.domain ?? (await getTopLevelDomain());
  const cookieStorage = await createCookieStorage({ ...options, domain });
  const cookieName = getCookieName(apiKey);
  const cookies = await cookieStorage.get(cookieName);
  const queryParams = getQueryParams();
  const sessionManager = await new SessionManager(cookieStorage, apiKey).load();

  return new BrowserConfig(apiKey, userId ?? cookies?.userId, {
    ...options,
    cookieStorage,
    sessionManager,
    deviceId: createDeviceId(cookies?.deviceId, options?.deviceId, queryParams.deviceId),
    domain,
    optOut: options?.optOut ?? Boolean(cookies?.optOut),
    sessionId: (await cookieStorage.get(cookieName))?.sessionId ?? options?.sessionId,
    storageProvider: await createEventsStorage(options),
    trackingOptions: { ...defaultConfig.trackingOptions, ...options?.trackingOptions },
    transportProvider: options?.transportProvider ?? createTransport(options?.transport),
  });
};

export const createCookieStorage = async (
  overrides?: BrowserOptions,
  baseConfig = getDefaultConfig(),
): Promise<Storage<UserSession>> => {
  const options = { ...baseConfig, ...overrides };
  const cookieStorage = overrides?.cookieStorage;
  if (!cookieStorage || !(await cookieStorage.isEnabled())) {
    return createFlexibleStorage<UserSession>(options);
  }
  return cookieStorage;
};

export const createFlexibleStorage = async <T>(options: BrowserOptions): Promise<Storage<T>> => {
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
  if (!hasStorageProviderProperty || overrides.storageProvider) {
    for (const storage of [overrides?.storageProvider, new LocalStorage<Event[]>()]) {
      if (storage && (await storage.isEnabled())) {
        return storage;
      }
    }
  }
  return undefined;
};

export const createDeviceId = (idFromCookies?: string, idFromOptions?: string, idFromQueryParams?: string) => {
  return idFromOptions || idFromQueryParams || idFromCookies || UUID();
};

export const createTransport = (transport?: TransportType) => {
  if (transport === TransportType.XHR) {
    return new XHRTransport();
  }
  if (transport === TransportType.SendBeacon) {
    return new SendBeaconTransport();
  }
  return getDefaultConfig().transportProvider;
};

export const getTopLevelDomain = async (url?: string) => {
  if (!(await new CookieStorage<string>().isEnabled()) || (!url && typeof location === 'undefined')) {
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
