import { LogLevel, Logger } from './logger';
import { Storage } from './storage';

import { Event } from './event';
import { Transport, TransportType } from './transport';
import { Plan } from './plan';
import { Plugin } from './plugin';
import { SessionManager, UserSession } from './session-manager';

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
  plan?: Plan;
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
  lastEventTime?: number;
  partnerId?: string;
  sessionId?: number;
  sessionManager: SessionManager;
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

export interface TrackingOptions {
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
}

export interface AdditionalBrowserOptions {
  attribution?: AttributionBrowserOptions;
}

export interface AttributionBrowserOptions {
  disabled?: boolean;
  excludeReferrers?: string[];
  initialEmptyValue?: string;
  trackNewCampaigns?: boolean;
  trackPageViews?: boolean;
}

export type BrowserOptions = Omit<
  Partial<
    BrowserConfig & {
      transport: TransportType;
    }
  >,
  'apiKey' | 'plugins' | 'sessionManager'
>;

export type NodeOptions = Omit<Partial<NodeConfig>, 'apiKey' | 'userId' | 'plugins' | 'lastEventTime'>;
