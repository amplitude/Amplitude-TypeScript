import { TransportType } from '../transport';
import { BrowserConfig, TrackingOptions } from './browser';

export interface ReactNativeConfig extends BrowserConfig {
  attribution?: ReactNativeAttributionOptions;
  trackingOptions: ReactNativeTrackingOptions;
  trackingSessionEvents?: boolean;
}

export interface ReactNativeTrackingOptions extends TrackingOptions {
  adid?: boolean;
  carrier?: boolean;
  deviceManufacturer?: boolean;
  deviceModel?: boolean;
  osName?: boolean;
  osVersion?: boolean;
}

export interface ReactNativeAttributionOptions {
  disabled?: boolean;
  excludeReferrers?: string[];
  initialEmptyValue?: string;
  resetSessionOnNewCampaign?: boolean;
  trackNewCampaigns?: boolean;
  trackPageViews?: boolean;
}

type HiddenOptions = 'apiKey' | 'lastEventId';

export interface ReactNativeOptions extends Omit<Partial<ReactNativeConfig>, HiddenOptions> {
  transport?: TransportType | keyof typeof TransportType;
}
