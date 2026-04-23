import { IConfig } from './core-config';
import { Storage } from '../storage';
import { UserSession } from '../user-session';

type HiddenOptions = 'apiKey' | 'lastEventId';

export type ReactNativeOptions = Omit<Partial<ReactNativeConfig>, HiddenOptions>;

export interface ReactNativeConfig extends Omit<IConfig, 'offline' | 'requestMetadata'> {
  trackingOptions: ReactNativeTrackingOptions;
  trackingSessionEvents?: boolean;
  migrateLegacyData?: boolean;
  appVersion?: string;
  attribution?: ReactNativeAttributionOptions;
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
  userId?: string;
}

export interface ReactNativeAttributionOptions {
  disabled?: boolean;
  excludeReferrers?: string[];
  initialEmptyValue?: string;
  trackNewCampaigns?: boolean;
  trackPageViews?: boolean;
  resetSessionOnNewCampaign?: boolean;
}

export interface ReactNativeTrackingOptions {
  adid?: boolean;
  carrier?: boolean;
  appSetId?: boolean;
  idfv?: boolean;
  country?: boolean;

  deviceManufacturer?: boolean;
  deviceModel?: boolean;
  ipAddress?: boolean;
  language?: boolean;
  osName?: boolean;
  osVersion?: boolean;
  platform?: boolean;
  [key: string]: boolean | undefined;
}
