import { UserSession } from '../user-session';
import { Storage } from '../storage';
import { TransportType } from '../transport';
import { Config } from './core';

export interface ReactNativeConfig extends Config {
  attribution?: ReactNativeAttributionOptions;
  appVersion?: string;
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
  trackingOptions: ReactNativeTrackingOptions;
  userId?: string;
  trackingSessionEvents?: boolean;
}

export interface ReactNativeTrackingOptions {
  adid?: boolean;
  carrier?: boolean;
  deviceManufacturer?: boolean;
  deviceModel?: boolean;
  ipAddress?: boolean;
  language?: boolean;
  osName?: boolean;
  osVersion?: boolean;
  platform?: boolean;
}

export interface ReactNativeAttributionOptions {
  disabled?: boolean;
  excludeReferrers?: string[];
  initialEmptyValue?: string;
  trackNewCampaigns?: boolean;
  trackPageViews?: boolean;
}

type HiddenOptions = 'apiKey' | 'lastEventId';

export interface ReactNativeOptions extends Omit<Partial<ReactNativeConfig>, HiddenOptions> {
  transport?: TransportType | keyof typeof TransportType;
}
