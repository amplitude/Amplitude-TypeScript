import { UserSession } from '../user-session';
import { IdentityStorageType, Storage } from '../storage';
import { Transport } from '../transport';
import { Config } from './core';
import { PageTrackingOptions } from '../page-view-tracking';

export interface BrowserConfig extends ExternalBrowserConfig, InternalBrowserConfig {}

export interface ExternalBrowserConfig extends Config {
  appVersion?: string;
  defaultTracking?: boolean | DefaultTrackingOptions;
  deviceId?: string;
  cookieOptions?: CookieOptions;
  identityStorage?: IdentityStorageType;
  partnerId?: string;
  sessionId?: number;
  sessionTimeout: number;
  trackingOptions: TrackingOptions;
  transport?: 'fetch' | 'xhr' | 'beacon';
  userId?: string;
}

interface InternalBrowserConfig {
  cookieStorage: Storage<UserSession>;
  lastEventTime?: number;
  lastEventId?: number;
  transportProvider: Transport;
}

export interface DefaultTrackingOptions {
  attribution?: boolean | AttributionOptions;
  fileDownloads?: boolean;
  formInteractions?: boolean;
  pageViews?: boolean | PageTrackingOptions;
  sessions?: boolean;
}

export interface TrackingOptions {
  ipAddress?: boolean;
  language?: boolean;
  platform?: boolean;
}

export interface AttributionOptions {
  excludeReferrers?: string[];
  initialEmptyValue?: string;
  resetSessionOnNewCampaign?: boolean;
}

export interface CookieOptions {
  domain?: string;
  expiration?: number;
  sameSite?: 'Strict' | 'Lax' | 'None';
  secure?: boolean;
  upgrade?: boolean;
}

type HiddenOptions = 'apiKey';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface BrowserOptions extends Omit<Partial<ExternalBrowserConfig>, HiddenOptions> {}
