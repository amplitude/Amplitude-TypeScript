import { IConfig } from './core-config';
import { Storage } from '../storage';
import { UserSession } from '../user-session';
import { NetworkTrackingOptions } from '../network-tracking';

type HiddenOptions = 'apiKey' | 'lastEventId' | 'persistedAppVersion' | 'persistedAppBuild';

export type ReactNativeOptions = Omit<Partial<ReactNativeConfig>, HiddenOptions>;

/* @experimental this config is experimental pending GA of React Native autocapture */
export interface ReactNativeAutocaptureOptions {
  sessions?: boolean;
  appLifecycles?: boolean;
  networkTracking?: boolean | NetworkTrackingOptions;
  screenViews?: boolean;
  // elementInteractions?
}

export interface ReactNativeConfig extends Omit<IConfig, 'requestMetadata'> {
  trackingOptions: ReactNativeTrackingOptions;
  trackingSessionEvents?: boolean;
  migrateLegacyData?: boolean;
  appVersion?: string;
  persistedAppVersion?: string;
  persistedAppBuild?: string;
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

// TODO: Merge this into ReactNativeConfig once autocapture is GA
export interface ReactNativeConfigAutocaptureBeta extends ReactNativeConfig {
  /* @experimental this config is experimental pending GA of React Native autocapture */
  autocapture?: boolean | ReactNativeAutocaptureOptions;
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
