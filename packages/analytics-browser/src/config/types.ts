import { AutocaptureOptions } from '@amplitude/analytics-types';

export type BrowserRemoteConfig = {
  browserSDK: {
    autocapture?: AutocaptureOptions | boolean;
  };
};
