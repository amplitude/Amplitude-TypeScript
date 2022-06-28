import { Storage } from '@amplitude/analytics-types';

export class LocalStorage<T> implements Storage<T> {
  async isEnabled(): Promise<boolean> {
    /* istanbul ignore if */
    if (typeof window === 'undefined') {
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
    return window.localStorage.getItem(key) || undefined;
  }

  async set(key: string, value: T): Promise<void> {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      //
    }
  }

  async remove(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(key);
    } catch {
      //
    }
  }

  async reset(): Promise<void> {
    try {
      window.localStorage.clear();
    } catch {
      //
    }
  }
}
