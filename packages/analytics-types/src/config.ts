import { LogLevel, Logger } from './logger';
import { Storage, UserSession } from './storage';

import { Event } from './event';
import { Transport } from './transport';
import { Plugin } from './plugin';

export enum ServerZone {
  US = 'US',
  EU = 'EU',
}

export interface Config {
  appVersion?: string;
  apiKey: string;
  userId?: string;
  deviceId?: string;
  sessionId?: number;
  flushIntervalMillis: number;
  flushMaxRetries: number;
  flushQueueSize: number;
  logLevel: LogLevel;
  loggerProvider: Logger;
  optOut: boolean;
  saveEvents: boolean;
  serverUrl: string | undefined;
  serverZone: ServerZone;
  storageProvider: Storage<Event[]>;
  transportProvider: Transport;
  partnerId?: string;
  plugins: Plugin[];
  useBatch: boolean;
  apiHost?: string;
}

export interface BrowserConfig extends Config {
  cookieExpiration: number;
  cookieSameSite: string;
  cookieSecure: boolean;
  cookieStorage: Storage<UserSession>;
  disableCookies: boolean;
  domain: string;
  includeGclid: boolean;
  includeFbclid: boolean;
  includeReferrer: boolean;
  includeUtm: boolean;
  sessionTimeout: number;
  trackingOptions: TrackingOptions;
}

export type InitOptions<T extends Config> =
  | Partial<Config> &
      Omit<T, keyof Config> & {
        apiKey: string;
        transportProvider: Transport;
        storageProvider: Storage<Event[]>;
      };

export type TrackingOptions = {
  city?: boolean;
  country?: boolean;
  carrier?: boolean;
  deviceManufacturer?: boolean;
  deviceModel?: boolean;
  dma?: boolean;
  ipAddress?: boolean;
  language?: boolean;
  osName?: boolean;
  osVersion?: boolean;
  platform?: boolean;
  region?: boolean;
  versionName?: boolean;
};
export type BrowserOptions = Omit<Partial<BrowserConfig>, 'apiKey' | 'userId' | 'plugins'>;
