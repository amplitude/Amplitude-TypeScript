import { Storage as AmplitudeStorage } from '@amplitude/analytics-types';

export class BrowserStorage<T> implements AmplitudeStorage<T> {
  constructor(private storage?: Storage) {}

  async isEnabled(): Promise<boolean> {
    /* istanbul ignore if */
    if (!this.storage) {
      return false;
    }

    const random = String(Date.now());
    const testStorage = new BrowserStorage<string>(this.storage);
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
      console.error(`[Amplitude] Error: Could not get value from storage`);
      return undefined;
    }
  }

  async getRaw(key: string): Promise<string | undefined> {
    return this.storage?.getItem(key) || undefined;
  }

  async set(key: string, value: T): Promise<void> {
    try {
      this.storage?.setItem(key, JSON.stringify(value));
    } catch {
      //
    }
  }

  async remove(key: string): Promise<void> {
    try {
      this.storage?.removeItem(key);
    } catch {
      //
    }
  }

  async reset(): Promise<void> {
    try {
      this.storage?.clear();
    } catch {
      //
    }
  }
}
