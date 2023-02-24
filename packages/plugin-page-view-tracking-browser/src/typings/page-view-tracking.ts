import { EnrichmentPlugin, BrowserClient, PageTrackingOptions as Options } from '@amplitude/analytics-types';

export {
  PageTrackingOptions as Options,
  PageTrackingTrackOn,
  PageTrackingHistoryChanges,
} from '@amplitude/analytics-types';

export interface CreatePageViewTrackingPlugin {
  (client: BrowserClient, options?: Options): EnrichmentPlugin;
  (options?: Options): EnrichmentPlugin;
}

export type CreatePageViewTrackingPluginParameters = [BrowserClient, Options?] | [Options?];
