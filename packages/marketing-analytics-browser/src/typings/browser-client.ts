import {
  AmplitudeReturn,
  BrowserClient as AnalyticsBrowserClient,
  BrowserOptions as AnalyticsBrowserOptions,
} from '@amplitude/analytics-types';
import { Types as PageViewTrackingTypes } from '@amplitude/plugin-page-view-tracking-browser';
import { Types as WebAttributionPluginTypes } from '@amplitude/plugin-web-attribution-browser';

export interface Client extends AnalyticsBrowserClient {
  init(apiKey: string, userId?: string, options?: Options): AmplitudeReturn<void>;
}

export type Options = Omit<AnalyticsBrowserOptions, 'defaultTracking'> & AttributionOptions & PageViewTracking;

export type AttributionOptions = {
  attribution?: WebAttributionPluginTypes.Options;
};

export type PageViewTracking = {
  pageViewTracking?: PageViewTrackingTypes.Options | boolean;
};
