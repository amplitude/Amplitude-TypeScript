import { getGlobalScope, ILogger } from '@amplitude/analytics-core';
import { BrowserStorage } from './browser-storage';

const MAX_ARRAY_LENGTH = 1000;

interface LocalStorageOptions {
  loggerProvider?: ILogger;
}
export class LocalStorage<T> extends BrowserStorage<T> {
  loggerProvider?: ILogger;

  constructor(config?: LocalStorageOptions) {
    let localStorage;

    try {
      localStorage = getGlobalScope()?.localStorage;
    } catch {
      localStorage = undefined;
    }
    super(localStorage);
    try {
      this.loggerProvider = config?.loggerProvider;
    } catch {
      this.loggerProvider = undefined;
    }
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
