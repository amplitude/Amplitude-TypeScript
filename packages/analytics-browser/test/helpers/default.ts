import { BrowserConfig, InitOptions } from '@amplitude/analytics-types';

import { createConfig } from '../../src/config';
import { createConfig as createConfigCore } from '@amplitude/analytics-core/src/config';

export const useDefaultConfig = (overrides?: Partial<InitOptions<BrowserConfig>>) =>
  createConfigCore<BrowserConfig>(API_KEY, USER_ID, createConfig({ ...DEFAULT_OPTIONS, ...overrides }));

export const API_KEY = 'apiKey';

export const USER_ID = 'userId';

export const DEFAULT_OPTIONS: InitOptions<BrowserConfig> = {
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
    device_manufacturer: true,
    device_model: true,
    dma: true,
    ip_address: true,
    language: true,
    os_name: true,
    os_version: true,
    platform: true,
    region: true,
    version_name: true,
  },
  transportProvider: {
    send: () => Promise.resolve(null),
  },
};
