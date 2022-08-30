import { LogLevel, Logger } from './logger';
import { Storage } from './storage';

import { Event } from './event';
import { Transport, TransportType } from './transport';
import { Plan } from './plan';
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
  serverUrl: string | undefined;
  serverZone?: ServerZone;
  storageProvider?: Storage<Event[]>;
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
}

export interface AdditionalBrowserOptions {
  attribution?: AttributionBrowserOptions;
  trackPageViews?: boolean | PageTrackingBrowserOptions;
}

export interface AttributionBrowserOptions {
  disabled?: boolean;
  excludeReferrers?: string[];
  initialEmptyValue?: string;
  resetSessionOnNewCampaign?: boolean;
  /** @deprecated New campaigns are now always tracked by default. Setting this to true also sets resetSessionOnNewCampaign to true. */
  trackNewCampaigns?: boolean;
  /** @deprecated Use the new top level trackPageViews configuration instead. */
  trackPageViews?: boolean;
}

export interface PageTrackingBrowserOptions {
  filter?: PageTrackingFilter;
}

export type PageTrackingFilter = 'onAttribution' | (() => boolean) | undefined;

export type BrowserOptions = Omit<
  Partial<
    BrowserConfig & {
      transport: TransportType;
    }
  >,
  'apiKey'
>;

export interface AdditionalReactNativeOptions {
  attribution?: AttributionReactNativeOptions;
  trackPageViews?: boolean | PageTrackingReactNativeOptions;
}

export type AttributionReactNativeOptions = AttributionBrowserOptions;

export type PageTrackingReactNativeOptions = PageTrackingBrowserOptions;

export type ReactNativeOptions = Omit<
  Partial<
    ReactNativeConfig & {
      transport: TransportType;
    }
  >,
  'apiKey'
>;

export type NodeOptions = Omit<Partial<NodeConfig>, 'apiKey'>;
