import { getGlobalScope } from '@amplitude/analytics-client-common';
import { BrowserStorage } from './browser-storage';
import { Logger } from '@amplitude/analytics-types';

export class LocalStorage<T> extends BrowserStorage<T> {
  logger?: Logger;

  constructor(logger?: Logger) {
    super(getGlobalScope()?.localStorage, logger);
  }

  async set(key: string, value: T): Promise<void> {
    if (Array.isArray(value) && value.length > 1000) {
      const droppedEvents = value.splice(0, value.length - 1000);
      const errorMessage = `Dropped ${droppedEvents.length} events because the queue length exceeded 1000.`;
      this.logger ? this.logger.error(errorMessage) : console.error(errorMessage);
    }

    await super.set(key, value);
  }
}
