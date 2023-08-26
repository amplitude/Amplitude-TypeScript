import { Destination as CoreDestination, buildResult } from '@amplitude/analytics-core';
import { BrowserConfig, DestinationContext as Context } from '@amplitude/analytics-types';

export class Destination extends CoreDestination {
  // this.config is defined in setup() which will always be called first
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  config: BrowserConfig;

  constructor(config: BrowserConfig) {
    super();
    this.config = config;
  }

  async fulfillRequest(list: Context[], code: number, message: string) {
    await this.config.diagnosticProvider?.track(list.length, code, message);
    this.saveEvents();
    list.forEach((context) => context.callback(buildResult(context.event, code, message)));
  }
}
