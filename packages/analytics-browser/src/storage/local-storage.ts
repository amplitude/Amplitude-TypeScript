import { getGlobalScope } from '@amplitude/analytics-client-common';
import { BrowserStorage } from './browser-storage';
import { Logger } from '@amplitude/analytics-types';

interface LocalStorageOptions {
  logger?: Logger;
}
export class LocalStorage<T> extends BrowserStorage<T> {
  loggerProvider?: Logger;

  constructor(config?: LocalStorageOptions) {
    super(getGlobalScope()?.localStorage);
    this.logger = config ? config.logger : undefined;
  }

  async set(key: string, value: T): Promise<void> {
    if (Array.isArray(value) && value.length > 1000) {
      const droppedEventsCount = value.length - 1000;
      value.slice(droppedEventsCount);
      const errorMessage = `Dropped ${droppedEventsCount} events because the queue length exceeded 1000.`;
      this.logger ? this.logger.error(errorMessage) : console.error(errorMessage);
    }

    await super.set(key, value);
  }
}
