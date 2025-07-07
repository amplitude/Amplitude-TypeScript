import { getGlobalScope, ILogger, BrowserStorage } from '@amplitude/analytics-core';

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
    } catch (e) {
      config?.loggerProvider?.debug(`Failed to access localStorage. error=${JSON.stringify(e)}`);
      localStorage = undefined;
    }
    super(localStorage);
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
