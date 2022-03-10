import { Storage } from '@amplitude/analytics-types';

export class LocalStorage<T> implements Storage<T> {
  isEnabled(): boolean {
    /* istanbul ignore if */
    if (typeof window === 'undefined') {
      return false;
    }

    const random = String(Date.now());
    const testStrorage = new LocalStorage<string>();
    const testKey = 'AMP_TEST';
    try {
      testStrorage.set(testKey, random);
      const value = testStrorage.get(testKey);
      return value === random;
    } catch {
      /* istanbul ignore next */
      return false;
    } finally {
      testStrorage.remove(testKey);
    }
  }

  get(key: string): T | undefined {
    try {
      const value = window.localStorage.getItem(key);
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

  set(key: string, value: T) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      //
    }
  }

  remove(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      //
    }
  }

  reset() {
    try {
      window.localStorage.clear();
    } catch {
      //
    }
  }
}
