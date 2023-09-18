import { EnrichmentPlugin } from '@amplitude/analytics-types';

export interface Options {
  /**
   * Whether or not the orignal user_properties field should be kept on the event
   */
  shouldKeepOriginalUserProperties?: boolean;
}

export interface GlobalUserPropertiesPlugin {
  (options?: Options): EnrichmentPlugin;
}
