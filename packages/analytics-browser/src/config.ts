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

export const getDefaultConfig = () => ({
  cookieExpiration: 365,
  cookieSameSite: 'Lax',
  cookieSecure: false,
  cookieStorage: new MemoryStorage<UserSession>(),
  disableCookies: false,
  domain: '',
  sessionTimeout: 30 * 60 * 1000,
  storageProvider: new MemoryStorage<Event[]>(),
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
});

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
      ...options,
      apiKey,
      storageProvider: options?.storageProvider ?? defaultConfig.storageProvider,
      transportProvider: options?.transportProvider ?? defaultConfig.transportProvider,
    });
    this.cookieStorage = options?.cookieStorage ?? defaultConfig.cookieStorage;
    this.sessionTimeout = options?.sessionTimeout ?? defaultConfig.sessionTimeout;
    this.sessionManager = new SessionManager(this.cookieStorage, {
      apiKey,
      sessionTimeout: this.sessionTimeout,
    });

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
  const cookieStorage = await createCookieStorage(options);
  const cookieName = getCookieName(apiKey);
  const cookies = await cookieStorage.get(cookieName);
  const queryParams = getQueryParams();
  const sessionTimeout = options?.sessionTimeout ?? defaultConfig.sessionTimeout;

  return new BrowserConfig(apiKey, userId ?? cookies?.userId, {
    ...options,
    cookieStorage,
    sessionTimeout,
    deviceId: createDeviceId(cookies?.deviceId, options?.deviceId, queryParams.deviceId),
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

export const createEventsStorage = async (overrides?: BrowserOptions): Promise<Storage<Event[]>> => {
  let eventsStorage = overrides?.storageProvider;
  if (!eventsStorage || !(await eventsStorage.isEnabled())) {
    eventsStorage = new LocalStorage();
    if (!(await eventsStorage.isEnabled())) {
      eventsStorage = new MemoryStorage();
    }
  }
  return eventsStorage;
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
