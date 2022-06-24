import { MemoryStorage } from '@amplitude/analytics-core';
import { BrowserConfig as IBrowserConfig, InitOptions } from '@amplitude/analytics-types';

import { BrowserConfig } from '../../src/config';

export const useDefaultConfig = (userId?: string, overrides?: Partial<InitOptions<BrowserConfig>>) =>
  new BrowserConfig(API_KEY, userId || USER_ID, { ...DEFAULT_OPTIONS, ...overrides });

export const API_KEY = 'apiKey';

export const USER_ID = 'userId';

export const DEFAULT_OPTIONS: InitOptions<IBrowserConfig> = {
  apiKey: API_KEY,
  cookieStorage: new MemoryStorage(),
  cookieExpiration: 365,
  cookieSameSite: 'Lax',
  cookieSecure: false,
  disableCookies: false,
  domain: '',
  storageProvider: {
    isEnabled: async () => true,
    get: async () => undefined,
    set: async () => undefined,
    remove: async () => undefined,
    reset: async () => undefined,
    getRaw: async () => undefined,
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
