import { getGlobalScope } from '@amplitude/analytics-client-common';
import { Storage } from '@amplitude/analytics-types';
import { Logger } from '@amplitude/analytics-types';

const MAX_ARRAY_LENGTH = 1000;

interface LocalStorageOptions {
  loggerProvider?: Logger;
}

export class LocalStorage<T> implements Storage<T> {
  loggerProvider?: Logger;

  constructor(config?: LocalStorageOptions) {
    this.loggerProvider = config?.loggerProvider;
  }

  async isEnabled(): Promise<boolean> {
    /* istanbul ignore if */
    if (!getGlobalScope()) {
      return false;
    }

    const random = String(Date.now());
    const testStorage = new LocalStorage<string>();
    const testKey = 'AMP_TEST';
    try {
      await testStorage.set(testKey, random);
      const value = await testStorage.get(testKey);
      return value === random;
    } catch {
      /* istanbul ignore next */
      return false;
    } finally {
      await testStorage.remove(testKey);
    }
  }

  async get(key: string): Promise<T | undefined> {
    try {
      const value = await this.getRaw(key);
      if (!value) {
        return undefined;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(value);
    } catch {
      /* istanbul ignore next */
      return undefined;
    }
  }

  async getRaw(key: string): Promise<string | undefined> {
    return getGlobalScope()?.localStorage.getItem(key) || undefined;
  }

  async set(key: string, value: T): Promise<void> {
    const isExceededArraySize = Array.isArray(value) && value.length > MAX_ARRAY_LENGTH;

    try {
      const serializedValue = isExceededArraySize
        ? JSON.stringify(value.slice(0, MAX_ARRAY_LENGTH) as T)
        : JSON.stringify(value);

      getGlobalScope()?.localStorage.setItem(key, serializedValue);
    } catch {
      //
    }

    if (isExceededArraySize) {
      const droppedEventsCount = value.length - MAX_ARRAY_LENGTH;
      this.loggerProvider?.error(
        `Failed to save ${droppedEventsCount} events because the queue length exceeded ${MAX_ARRAY_LENGTH}.`,
      );
    }
  }

  async remove(key: string): Promise<void> {
    try {
      getGlobalScope()?.localStorage.removeItem(key);
    } catch {
      //
    }
  }

  async reset(): Promise<void> {
    try {
      getGlobalScope()?.localStorage.clear();
    } catch {
      //
    }
  }
}
