import { BrowserConfig, InitOptions } from '@amplitude/analytics-types';

import { CookieStorage } from './storage/cookie';
import { FetchTransport } from './transports/fetch';
import { LocalStorage } from './storage/local-storage';
import { MemoryStorage } from './storage/memory';
import { getConfig as _getConfig } from '@amplitude/analytics-core';

export const defaultConfig: InitOptions<BrowserConfig> = {
  cookieStorage: new MemoryStorage(),
  cookieExpiration: 365,
  cookieSameSite: 'Lax',
  cookieSecure: false,
  disableCookies: false,
  domain: '',
  storageProvider: new MemoryStorage(),
  transportProvider: new FetchTransport(),
};

export const createConfig = (overrides?: Partial<InitOptions<BrowserConfig>>) => {
  const options = {
    ...defaultConfig,
    ...overrides,
    cookieStorage: createCookieStorage(overrides),
    storageProvider: createEventsStorage(overrides),
  };

  return options;
};

export const createCookieStorage = (
  overrides?: Partial<InitOptions<BrowserConfig>>,
  baseConfig: InitOptions<BrowserConfig> = defaultConfig,
) => {
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

export const createEventsStorage = (overrides?: Partial<InitOptions<BrowserConfig>>) => {
  let eventsStorage = overrides?.storageProvider;
  if (!eventsStorage || !eventsStorage.isEnabled()) {
    eventsStorage = new LocalStorage();
    if (!eventsStorage.isEnabled()) {
      eventsStorage = new MemoryStorage();
    }
  }
  return eventsStorage;
};

export const getConfig = () => {
  return _getConfig<BrowserConfig>();
};
