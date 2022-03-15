import { Storage, UserSession } from './storage';

import { Event } from './event';
import { Transport } from './transport';

export interface Config {
  appVersion?: string;
  apiKey: string;
  userId?: string;
  flushIntervalMillis: number;
  flushMaxRetries: number;
  flushQueueSize: number;
  serverUrl: string;
  storageProvider: Storage<Event[]>;
  transportProvider: Transport;
}

export interface BrowserConfig extends Config {
  cookieStorage: Storage<UserSession>;
  cookieExpiration: number;
  cookieSameSite: string;
  cookieSecure: boolean;
  disableCookies: boolean;
  domain: string;
  trackingOptions: TrackingOptions;
}

export type InitOptions<T extends Config> =
  | Omit<Partial<Config>, 'apiKey' | 'userId'> &
      Omit<T, keyof Config> & {
        transportProvider: Transport;
        storageProvider: Storage<Event[]>;
      };

export type TrackingOptions = {
  city?: boolean;
  country?: boolean;
  carrier?: boolean;
  device_manufacturer?: boolean;
  device_model?: boolean;
  dma?: boolean;
  ip_address?: boolean;
  language?: boolean;
  os_name?: boolean;
  os_version?: boolean;
  platform?: boolean;
  region?: boolean;
  version_name?: boolean;
};
