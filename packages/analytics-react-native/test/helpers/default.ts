import { MemoryStorage } from '@amplitude/analytics-core';
import { ReactNativeConfig as IReactNativeConfig, InitOptions, UserSession } from '@amplitude/analytics-types';
import { SessionManager } from '../../src/session-manager';

import { ReactNativeConfig } from '../../src/config';

export const useDefaultConfig = (userId?: string, overrides?: Partial<InitOptions<ReactNativeConfig>>) =>
  new ReactNativeConfig(API_KEY, userId || USER_ID, { ...DEFAULT_OPTIONS, ...overrides });

export const API_KEY = 'apiKey';

export const USER_ID = 'userId';

const cookieStorage = new MemoryStorage<UserSession>();

export const DEFAULT_OPTIONS: InitOptions<IReactNativeConfig> = {
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
  sessionManager: new SessionManager(cookieStorage, API_KEY),
  sessionTimeout: 30 * 60 * 1000,
};
