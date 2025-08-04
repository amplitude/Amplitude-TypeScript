import type { EnrichmentPlugin, PageUrlEnrichmentOptions as Options } from '@amplitude/analytics-types';

export { PageUrlEnrichmentOptions as Options } from '@amplitude/analytics-types';

export interface CreatePageUrlEnrichmentBrowserPlugin {
  (options?: Options): EnrichmentPlugin;
}
