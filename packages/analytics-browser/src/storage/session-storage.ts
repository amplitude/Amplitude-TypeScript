import { getGlobalScope } from '@amplitude/analytics-client-common';
import { Storage } from '@amplitude/analytics-types';

export class SessionStorage<T> implements Storage<T> {
  async isEnabled(): Promise<boolean> {
    /* istanbul ignore if */
    if (!getGlobalScope()) {
      return false;
    }

    const random = String(Date.now());
    const testStorage = new SessionStorage<string>();
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
    return getGlobalScope()?.sessionStorage.getItem(key) || undefined;
  }

  async set(key: string, value: T): Promise<void> {
    try {
      getGlobalScope()?.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      //
    }
  }

  async remove(key: string): Promise<void> {
    try {
      getGlobalScope()?.sessionStorage.removeItem(key);
    } catch {
      //
    }
  }

  async reset(): Promise<void> {
    try {
      getGlobalScope()?.sessionStorage.clear();
    } catch {
      //
    }
  }
}
