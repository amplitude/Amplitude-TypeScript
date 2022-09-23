import { Event, PluginType, EnrichmentPlugin } from '@amplitude/analytics-types';
import { VERSION } from '../version';

export class Context implements EnrichmentPlugin {
  name = 'context';
  type = PluginType.ENRICHMENT as const;

  library = `amplitude-ma-ts/${VERSION}`;

  setup(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  async execute(context: Event): Promise<Event> {
    const event: Event = {
      ...context,
      library: this.library,
    };
    return event;
  }
}
