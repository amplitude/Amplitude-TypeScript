import { MemoryStorage } from '@amplitude/analytics-core';
import { BrowserConfig as IBrowserConfig, BrowserOptions, UserSession } from '@amplitude/analytics-types';

import { BrowserConfig } from '../../src/config';

export const useDefaultConfig = (overrides?: BrowserOptions) =>
  new BrowserConfig(API_KEY, { ...DEFAULT_OPTIONS, ...overrides });

export const API_KEY = 'apiKey';

export const USER_ID = 'userId';

const cookieStorage = new MemoryStorage<UserSession>();

export const DEFAULT_OPTIONS: Partial<IBrowserConfig> = {
  apiKey: API_KEY,
  cookieStorage,
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
    deviceManufacturer: true,
    deviceModel: true,
    ipAddress: true,
    language: true,
    osName: true,
    osVersion: true,
    platform: true,
  },
  transportProvider: {
    send: () => Promise.resolve(null),
  },
  sessionTimeout: 30 * 60 * 1000,
};
