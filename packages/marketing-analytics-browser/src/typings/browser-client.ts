import {
  AmplitudeReturn,
  BrowserClient as AnalyticsBrowserClient,
  BrowserOptions as AnalyticsBrowserOptions,
} from '@amplitude/analytics-types';
import { Types as PageViewTrackingTypes } from '@amplitude/plugin-page-view-tracking-browser';
import { Types as WebAttributionPluginTypes } from '@amplitude/plugin-web-attribution-browser';

export interface BrowserClient extends AnalyticsBrowserClient {
  init(apiKey: string, userId?: string, options?: BrowserOptions): AmplitudeReturn<void>;
}

export type BrowserOptions = AnalyticsBrowserOptions & {
  attribution?: WebAttributionPluginTypes.Options;
} & {
  trackPageViews?: PageViewTrackingTypes.Options | boolean;
};
