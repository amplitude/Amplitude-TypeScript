import {
  BrowserOptions,
  BrowserConfig as IBrowserConfig,
  Storage,
  TrackingOptions,
  UserSession,
} from '@amplitude/analytics-types';
import { Config, getConfig as _getConfig } from '@amplitude/analytics-core';

import { CookieStorage } from './storage/cookie';
import { FetchTransport } from './transports/fetch';
import { LocalStorage } from './storage/local-storage';
import { MemoryStorage } from './storage/memory';
import { UUID } from './utils/uuid';
import { getCookieName } from './session-manager';
import { getQueryParams } from './utils/query-params';

export const defaultConfig = {
  cookieExpiration: 365,
  cookieSameSite: 'Lax',
  cookieSecure: false,
  disableCookies: false,
  domain: '',
  sessionTimeout: 30 * 60 * 1000,
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
};

export class BrowserConfig extends Config implements IBrowserConfig {
  cookieExpiration: number;
  cookieSameSite: string;
  cookieSecure: boolean;
  cookieStorage: Storage<UserSession>;
  disableCookies: boolean;
  domain: string;
  sessionTimeout: number;
  trackingOptions: TrackingOptions;

  constructor(apiKey: string, userId?: string, options?: BrowserOptions) {
    const cookieStorage = createCookieStorage(options);
    const storageProvider = createEventsStorage(options);
    const transportProvider = options?.transportProvider || defaultConfig.transportProvider;
    const sessionTimeout = options?.sessionTimeout || defaultConfig.sessionTimeout;
    const trackingOptions = { ...defaultConfig.trackingOptions, ...options?.trackingOptions };
    const cookieName = getCookieName(apiKey);
    const cookies = cookieStorage.get(cookieName);
    const queryParams = getQueryParams();

    super({
      ...options,
      apiKey,
      storageProvider,
      transportProvider,
      userId: userId || cookies?.userId,
      deviceId: createDeviceId(cookies?.deviceId, options?.deviceId, queryParams.deviceId),
      sessionId: createSessionId(cookies?.sessionId, options?.sessionId, cookies?.lastEventTime, sessionTimeout),
    });

    this.cookieExpiration = options?.cookieExpiration || defaultConfig.cookieExpiration;
    this.cookieSameSite = options?.cookieSameSite || defaultConfig.cookieSameSite;
    this.cookieSecure = options?.cookieSecure || defaultConfig.cookieSecure;
    this.cookieStorage = cookieStorage;
    this.disableCookies = options?.disableCookies || defaultConfig.disableCookies;
    this.domain = options?.domain || defaultConfig.domain;
    this.sessionTimeout = sessionTimeout;
    this.trackingOptions = trackingOptions;
  }
}

export const createConfig = (apiKey: string, userId?: string, overrides?: BrowserOptions): IBrowserConfig => {
  return new BrowserConfig(apiKey, userId, overrides);
};

export const createCookieStorage = (overrides?: BrowserOptions, baseConfig = defaultConfig) => {
  const options = { ...baseConfig, ...overrides };
  let cookieStorage = overrides?.cookieStorage;
  if (!cookieStorage || !cookieStorage.isEnabled()) {
    cookieStorage = new CookieStorage({
      domain: options.domain,
      expirationDays: options.cookieExpiration,
      sameSite: options.cookieSameSite,
      secure: options.cookieSecure,
    });
    if (options.disableCookies || !cookieStorage.isEnabled()) {
      cookieStorage = new LocalStorage();
      if (!cookieStorage.isEnabled()) {
        cookieStorage = new MemoryStorage();
      }
    }
  }
  return cookieStorage;
};

export const createEventsStorage = (overrides?: BrowserOptions) => {
  let eventsStorage = overrides?.storageProvider;
  if (!eventsStorage || !eventsStorage.isEnabled()) {
    eventsStorage = new LocalStorage();
    if (!eventsStorage.isEnabled()) {
      eventsStorage = new MemoryStorage();
    }
  }
  return eventsStorage;
};

export const createDeviceId = (idFromCookies?: string, idFromOptions?: string, idFromQueryParams?: string) => {
  return idFromOptions || idFromQueryParams || idFromCookies || UUID();
};

export const createSessionId = (idFromCookies = 0, idFromOptions = 0, lastEventTime = 0, sessionTimeout: number) => {
  if (idFromCookies && Date.now() - lastEventTime < sessionTimeout) {
    return idFromCookies;
  }
  return idFromOptions ? idFromOptions : Date.now();
};

export const getConfig = () => {
  return _getConfig() as BrowserConfig;
};
