import { Event, PluginType, EnrichmentPlugin } from '@amplitude/analytics-types';
import { VERSION } from '../version';

export const context = (): EnrichmentPlugin => {
  const library = `amplitude-ma-ts/${VERSION}`;
  return {
    name: 'context',
    type: PluginType.ENRICHMENT,
    setup: async () => undefined,
    execute: async (context: Event) => ({
      ...context,
      library,
    }),
  };
};
