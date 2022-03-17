import { BrowserConfig, InitOptions } from '@amplitude/analytics-types';

import { createConfig } from '../../src/config';

export const useDefaultConfig = (userId?: string, overrides?: Partial<InitOptions<BrowserConfig>>) =>
  createConfig(API_KEY, userId || USER_ID, { ...DEFAULT_OPTIONS, ...overrides });

export const API_KEY = 'apiKey';

export const USER_ID = 'userId';

export const DEFAULT_OPTIONS: InitOptions<BrowserConfig> = {
  apiKey: API_KEY,
  cookieStorage: {
    isEnabled: () => true,
    get: () => undefined,
    set: () => undefined,
    remove: () => undefined,
    reset: () => undefined,
  },
  cookieExpiration: 365,
  cookieSameSite: 'Lax',
  cookieSecure: false,
  disableCookies: false,
  domain: '',
  storageProvider: {
    isEnabled: () => true,
    get: () => undefined,
    set: () => undefined,
    remove: () => undefined,
    reset: () => undefined,
  },
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
  transportProvider: {
    send: () => Promise.resolve(null),
  },
  sessionTimeout: 30 * 60 * 1000,
};
