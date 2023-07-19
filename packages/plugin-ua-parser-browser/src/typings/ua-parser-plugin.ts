/* eslint-disable @typescript-eslint/no-empty-interface */
import { EnrichmentPlugin } from '@amplitude/analytics-types';

export interface Options {
  osName?: boolean;
  osVersion?: boolean;
  deviceManufacturer?: boolean;
  deviceModel?: boolean;
}

export interface CreateUaParserPlugin {
  (options?: Options): EnrichmentPlugin;
}
