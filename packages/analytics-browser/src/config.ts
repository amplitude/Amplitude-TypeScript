import { FetchTransport } from './transport/fetch';
import { getConfig as _getConfig } from '@amplitude/analytics-core';
import { BrowserConfig, InitOptions } from '@amplitude/analytics-types';
import { LocalStorage } from './storage/local-storage';
import { CookieStorage } from './storage/cookie';
import { MemoryStorage } from './storage/memory';

export const defaultConfig: InitOptions<BrowserConfig> = {
  cookieStorage: new MemoryStorage(),
  cookieExpiration: 365,
  cookieSameSite: 'Lax',
  cookieSecure: false,
  disableCookies: false,
  domain: '',
  transportProvider: new FetchTransport(),
  storageProvider: new MemoryStorage(),
};

export const createConfig = (config?: Partial<InitOptions<BrowserConfig>>) => {
  const options = {
    ...defaultConfig,
    ...config,
    cookieStorage: createCookieStorage(defaultConfig, config),
    storageProvider: createEventsStorage(defaultConfig, config),
  };

  return options;
};

export const createCookieStorage = (
  defaultConfig: InitOptions<BrowserConfig>,
  config?: Partial<InitOptions<BrowserConfig>>,
) => {
  const options = { ...defaultConfig, ...config };
  let cookieStorage = config?.cookieStorage;
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

export const createEventsStorage = (
  _defaultConfig: InitOptions<BrowserConfig>,
  config?: Partial<InitOptions<BrowserConfig>>,
) => {
  let eventsStorage = config?.storageProvider;
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
