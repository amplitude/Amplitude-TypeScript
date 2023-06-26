import { MemoryStorage } from '@amplitude/analytics-core';
import { ReactNativeConfig as IReactNativeConfig, ReactNativeOptions, UserSession } from '@amplitude/analytics-types';

import { ReactNativeConfig } from '../../src/config';

export const useDefaultConfig = (overrides?: ReactNativeOptions) =>
  new ReactNativeConfig(API_KEY, { ...DEFAULT_OPTIONS, ...overrides });

export const API_KEY = 'apiKey';

export const USER_ID = 'userId';

const cookieStorage = new MemoryStorage<UserSession>();

export const DEFAULT_OPTIONS: Partial<IReactNativeConfig> = {
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
  },
  transportProvider: {
    send: () => Promise.resolve(null),
  },
  sessionTimeout: 5 * 60 * 1000,
};
