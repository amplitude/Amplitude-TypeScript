import { EnrichmentPlugin, BrowserClient } from '@amplitude/analytics-types';

export interface Options {
  trackOn?: PageTrackingTrackOn;
  trackHistoryChanges?: PageTrackingHistoryChanges;
}

export type PageTrackingTrackOn = 'attribution' | (() => boolean);

export type PageTrackingHistoryChanges = 'all' | 'pathOnly';

export interface CreatePageViewTrackingPlugin {
  (client: BrowserClient, options?: Options): EnrichmentPlugin;
  (options?: Options): EnrichmentPlugin;
}

export type CreatePageViewTrackingPluginParameters = [BrowserClient, Options?] | [Options?];
