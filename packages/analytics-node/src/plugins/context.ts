import { BeforePlugin, NodeConfig, Event, PluginType } from '@amplitude/analytics-types';
import { UUID } from '@amplitude/analytics-core';
import { VERSION } from '../version';

export class Context implements BeforePlugin {
  name = 'context';
  type = PluginType.BEFORE as const;

  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: NodeConfig;
  eventId = 0;
  library = `amplitude-node-ts/${VERSION}`;

  setup(config: NodeConfig): Promise<undefined> {
    this.config = config;
    return Promise.resolve(undefined);
  }

  execute(context: Event): Promise<Event> {
    return new Promise((resolve) => {
      const time = new Date().getTime();

      const contextEvent: Event = {
        time,
        insert_id: UUID(),
        plan: this.config.plan,
        ...(this.config.ingestionMetadata && {
          ingestion_metadata: {
            source_name: this.config.ingestionMetadata.sourceName,
            source_version: this.config.ingestionMetadata.sourceVersion,
          },
        }),
        ...context,
        event_id: this.eventId++,
        library: this.library,
      };
      return resolve(contextEvent);
    });
  }
}
