import { LogLevel, Logger } from './logger';
import { Storage, UserSession } from './storage';

import { Event } from './event';
import { Transport, TransportType } from './transport';
import { Plugin } from './plugin';

export enum ServerZone {
  US = 'US',
  EU = 'EU',
}

export interface Config {
  apiKey: string;
  flushIntervalMillis: number;
  flushMaxRetries: number;
  flushQueueSize: number;
  logLevel: LogLevel;
  loggerProvider: Logger;
  minIdLength?: number;
  optOut: boolean;
  partnerId?: string;
  plugins: Plugin[];
  saveEvents: boolean;
  serverUrl: string | undefined;
  serverZone?: ServerZone;
  storageProvider: Storage<Event[]>;
  transportProvider: Transport;
  useBatch: boolean;
}

export interface BrowserConfig extends Config {
  appVersion?: string;
  deviceId?: string;
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
  sessionId?: number;
  sessionTimeout: number;
  trackingOptions: TrackingOptions;
  userId?: string;
}

export type NodeConfig = Config;

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

export type BrowserOptions = Omit<
  Partial<
    BrowserConfig & {
      transport: TransportType;
    }
  >,
  'apiKey' | 'userId' | 'plugins'
>;

export type NodeOptions = Omit<Partial<NodeConfig>, 'apiKey' | 'userId' | 'plugins'>;
