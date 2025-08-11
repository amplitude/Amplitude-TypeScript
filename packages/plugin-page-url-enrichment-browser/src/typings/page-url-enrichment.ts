import type { EnrichmentPlugin, PageUrlEnrichmentOptions as Options } from '@amplitude/analytics-core';

export type { PageUrlEnrichmentOptions as Options } from '@amplitude/analytics-core';

export interface CreatePageUrlEnrichmentBrowserPlugin {
  (options?: Options): EnrichmentPlugin;
}
