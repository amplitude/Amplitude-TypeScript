import { Destination as CoreDestination, buildResult } from '@amplitude/analytics-core';
import { BrowserConfig, DestinationContext as Context } from '@amplitude/analytics-types';

export class Destination extends CoreDestination {
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
