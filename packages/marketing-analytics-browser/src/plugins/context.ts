import { Event, EnrichmentPlugin } from '@amplitude/analytics-types';
import { VERSION } from '../version';

export const context = (): EnrichmentPlugin => {
  const library = `amplitude-ma-ts/${VERSION}`;
  return {
    name: 'context',
    type: 'enrichment',
    setup: async () => undefined,
    execute: async (context: Event) => ({
      ...context,
      library,
    }),
  };
};
