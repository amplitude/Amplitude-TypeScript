import { getGlobalScope } from '@amplitude/analytics-client-common';
import { BrowserStorage } from './browser-storage';
import { Logger } from '@amplitude/analytics-types';

const MAX_ARRAY_LENGTH = 1000;

interface LocalStorageOptions {
  loggerProvider?: Logger;
}
export class LocalStorage<T> extends BrowserStorage<T> {
  loggerProvider?: Logger;

  constructor(config?: LocalStorageOptions) {
    super(getGlobalScope()?.localStorage);
    this.loggerProvider = config?.loggerProvider;
  }

  async set(key: string, value: T): Promise<void> {
    if (Array.isArray(value) && value.length > MAX_ARRAY_LENGTH) {
      const droppedEventsCount = value.length - MAX_ARRAY_LENGTH;
      await super.set(key, value.slice(0, MAX_ARRAY_LENGTH) as T);
      this.loggerProvider?.error(
        `Failed to save ${droppedEventsCount} events because the queue length exceeded ${MAX_ARRAY_LENGTH}.`,
      );
    } else {
      await super.set(key, value);
    }
  }
}
