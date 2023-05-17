import { UserSession } from '../user-session';
import { Storage } from '../storage';
import { TransportType } from '../transport';
import { Config } from './core';
import { PageTrackingOptions } from '../page-view-tracking';

export interface BrowserConfig extends Config {
  appVersion?: string;
  defaultTracking?: boolean | DefaultTrackingOptions;
  deviceId?: string;
  cookieExpiration: number;
  cookieSameSite: string;
  cookieSecure: boolean;
  cookieStorage: Storage<UserSession>;
  cookieUpgrade: boolean;
  disableCookies: boolean;
  domain: string;
  lastEventTime?: number;
  lastEventId?: number;
  partnerId?: string;
  sessionId?: number;
  sessionTimeout: number;
  trackingOptions: TrackingOptions;
  userId?: string;
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

export interface BrowserOptions extends Omit<Partial<BrowserConfig>, 'apiKey'> {
  transport?: TransportType | keyof typeof TransportType;
}
