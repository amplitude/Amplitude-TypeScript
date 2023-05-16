import { Types as PageViewTrackingTypes } from '@amplitude/plugin-page-view-tracking-browser';
import { Types as WebAttributionPluginTypes } from '@amplitude/plugin-web-attribution-browser';

export type AttributionOptions = {
  attribution?: WebAttributionPluginTypes.Options;
};

export type PageViewTracking = {
  pageViewTracking?: PageViewTrackingTypes.Options | boolean;
};
