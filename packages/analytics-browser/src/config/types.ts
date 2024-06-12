import { DefaultTrackingOptions } from '@amplitude/analytics-types';
import { AutocaptureOptions } from '@amplitude/plugin-autocapture-browser';

export type BrowserRemoteConfig = {
  browserSDK: {
    autoCapture?: AutocaptureOptions;
    defaultTracking?: DefaultTrackingOptions;
  };
};
