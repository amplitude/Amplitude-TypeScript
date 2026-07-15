import { IConfig } from './core-config';
import { Storage } from '../storage';
import { UserSession } from '../user-session';
import { RemoteConfigOptions } from './browser-config';
import { NetworkTrackingOptions } from '../network-tracking';
import { IRemoteConfigClient } from '../../remote-config/remote-config';

export type AutocaptureOptionsReactNative = {
  sessions?: boolean;
  screenViews?: boolean;
  appState?: boolean;
  elementInteractions?: boolean;
  networkTracking?: boolean | NetworkTrackingOptions;
};

type HiddenOptions = 'apiKey' | 'lastEventId' | 'remoteConfigClient';

export type ReactNativeOptions = Omit<Partial<ReactNativeConfig>, HiddenOptions>;

export interface ReactNativeConfig extends Omit<IConfig, 'requestMetadata'> {
  trackingOptions: ReactNativeTrackingOptions;
  /* @deprecated this config is deprecated in favor of config.autocapture */
  trackingSessionEvents?: boolean;
  autocapture?: boolean | AutocaptureOptionsReactNative;
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
  /* @experimental this config is experimental pending GA of React Native autocapture */
  remoteConfig?: RemoteConfigOptions;
  remoteConfigClient?: IRemoteConfigClient;
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
