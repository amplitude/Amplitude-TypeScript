import { Storage } from '@amplitude/analytics-types';

export class LocalStorage implements Storage {
  isEnabled(): boolean {
    const random = String(Date.now());
    try {
      this.set(random, random);
      return this.get(random) === String(random);
    } catch {
      return false;
    } finally {
      this.remove(random);
    }
  }

  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      /* istanbul ignore next */
      return null;
    }
  }

  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
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
