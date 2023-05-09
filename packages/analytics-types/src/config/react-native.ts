import { TransportType } from '../transport';
import { BrowserConfig, TrackingOptions } from './browser';

export interface ReactNativeConfig extends BrowserConfig {
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

type HiddenOptions = 'apiKey' | 'lastEventId';

export interface ReactNativeOptions extends Omit<Partial<ReactNativeConfig>, HiddenOptions> {
  transport?: TransportType | keyof typeof TransportType;
}
