/* eslint-disable @typescript-eslint/no-empty-interface */
import { EnrichmentPlugin } from '@amplitude/analytics-types';

export interface CreatePageViewV1EnrichmentPlugin {
  (): EnrichmentPlugin;
}
