import { BeforePlugin, Event } from '@amplitude/analytics-types';
import { BrowserConfig } from 'src/config';

export class NetworkCheckerPlugin implements BeforePlugin {
  name = '@amplitude/plugin-network-checker-browser';
  type = 'before' as const;

  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;

  setup(config: BrowserConfig): Promise<undefined> {
    this.config = config;
    return Promise.resolve(undefined);
  }

  async execute(context: Event): Promise<Event> {
    this.config.offline = !navigator.onLine;
    return context;
  }
}
