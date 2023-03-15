import { UserSession } from '../user-session';
import { Storage } from '../storage';
import { TransportType } from '../transport';
import { Config } from './core';
import { PageTrackingOptions } from '../page-view-tracking';

export interface BrowserConfig extends Config {
  appVersion?: string;
  attribution?: AttributionOptions;
  defaultTracking?: boolean | DefaultTrackingOptions;
  visualTracking?: VisualTrackingOptions;
  deviceId?: string;
  cookieExpiration: number;
  cookieSameSite: string;
  cookieSecure: boolean;
  cookieStorage: Storage<UserSession>;
  cookieUpgrade: boolean;
  disableCookies: boolean;
  domain: string;
  lastEventTime?: number;
  partnerId?: string;
  sessionId?: number;
  sessionTimeout: number;
  trackingOptions: TrackingOptions;
  userId?: string;
}

export interface DefaultTrackingOptions {
  fileDownloads?: boolean;
  formInteractions?: boolean;
  pageViews?: boolean | PageTrackingOptions;
  sessions?: boolean;
}

export interface VisualTag {
  name: string;
  action: string;
  element: string;
  page: string;
}

export interface VisualTrackingOptions {
  enabled?: boolean;
  remote?: {
    sourceId?: string;
  };
  tags?: VisualTag[];
}

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

export interface AttributionOptions {
  disabled?: boolean;
  excludeReferrers?: string[];
  initialEmptyValue?: string;
  resetSessionOnNewCampaign?: boolean;
  trackNewCampaigns?: boolean;
  trackPageViews?: boolean;
}

export interface BrowserOptions extends Omit<Partial<BrowserConfig>, 'apiKey'> {
  transport?: TransportType | keyof typeof TransportType;
}
