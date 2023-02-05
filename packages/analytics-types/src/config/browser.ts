import { SessionManager, UserSession } from '../session-manager';
import { Storage } from '../storage';
import { TransportType } from '../transport';
import { Config } from './core';

export interface BrowserConfig extends Config {
  appVersion?: string;
  attribution?: AttributionOptions;
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
  sessionManager: SessionManager;
  sessionTimeout: number;
  trackingOptions: TrackingOptions;
  userId?: string;
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
  trackNewCampaigns?: boolean;
  trackPageViews?: boolean;
}

export interface BrowserOptions extends Omit<Partial<BrowserConfig>, 'apiKey'> {
  transport?: TransportType | keyof typeof TransportType;
}
