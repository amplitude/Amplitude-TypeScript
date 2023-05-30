/* eslint-disable @typescript-eslint/no-empty-interface */
import { EnrichmentPlugin } from '@amplitude/analytics-types';

export interface Options {}

export interface CreateSessionReplayPlugin {
  (options?: Options): EnrichmentPlugin;
}
