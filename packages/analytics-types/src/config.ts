import { LogLevel, Logger } from './logger';
import { Storage } from './storage';

import { Event } from './event';
import { Transport, TransportType } from './transport';
import { Plan } from './plan';
import { IngestionMetadata } from './ingestion-metadata';
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
  ingestionMetadata?: IngestionMetadata;
  serverUrl: string | undefined;
  serverZone?: ServerZone;
  storageProvider?: Storage<Event[]>;
  transportProvider: Transport;
  useBatch: boolean;
}

export interface BrowserConfig extends Config {
  appVersion?: string;
  attribution?: AttributionOptions;
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

export type ReactNativeConfig = Omit<BrowserConfig, 'trackingOptions'> & {
  trackingOptions: ReactNativeTrackingOptions;
};

export type NodeConfig = Config;

export type InitOptions<T extends Config> =
  | Partial<Config> &
      Omit<T, keyof Config> & {
        apiKey: string;
        transportProvider: Transport;
      };

export interface TrackingOptions {
  deviceManufacturer?: boolean;
  deviceModel?: boolean;
  ipAddress?: boolean;
  language?: boolean;
  osName?: boolean;
  osVersion?: boolean;
  platform?: boolean;
  [key: string]: boolean | undefined;
}

export interface ReactNativeTrackingOptions extends TrackingOptions {
  adid?: boolean;
  carrier?: boolean;
  sessionEvents?: boolean;
}

export interface AttributionOptions {
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
  'apiKey'
>;

export type ReactNativeOptions = Omit<
  Partial<
    ReactNativeConfig & {
      transport: TransportType;
    }
  >,
  'apiKey'
>;

export type NodeOptions = Omit<Partial<NodeConfig>, 'apiKey'>;
