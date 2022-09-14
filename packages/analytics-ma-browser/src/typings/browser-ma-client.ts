import { AmplitudeReturn, BrowserClient, BrowserOptions } from '@amplitude/analytics-types';
import { Types as PageViewTrackingPluginTypes } from '@amplitude/plugin-page-view-tracking-browser';
import { Types as WebAttributionPluginTypes } from '@amplitude/plugin-web-attribution-browser';

export interface BrowserMaClient extends BrowserClient {
  init(apiKey: string, userId?: string, options?: BrowserMaOptions): AmplitudeReturn<void>;
}

export type BrowserMaOptions = BrowserOptions & { attribution?: WebAttributionPluginTypes.AttributionPluginOptions } & {
  trackPageViews?: PageViewTrackingPluginTypes.PageTrackingBrowserOptions | boolean;
};
