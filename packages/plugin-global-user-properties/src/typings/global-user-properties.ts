import { EnrichmentPlugin } from '@amplitude/analytics-types';

export interface Options {
  /**
   * A configuration to modify the user properties before they are attached as global user properties
   *
   * @param properties The original user properties on the event
   * @returns The modified global user properties. Returning no properties is possible
   */
  propertyTransform?: (properties: { [key: string]: any }) => { [key: string]: any } | undefined;
  /**
   * Whether or not the orignal user_properties field should be kept on the event
   */
  shouldKeepOriginalUserProperties?: boolean;
}

export interface GlobalUserPropertiesPlugin {
  (options?: Options): EnrichmentPlugin;
}
