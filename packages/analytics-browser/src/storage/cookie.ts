import { Storage, CookieStorageOptions } from '@amplitude/analytics-types';

export class CookieStorage<T> implements Storage<T> {
  options: CookieStorageOptions;

  constructor(options?: CookieStorageOptions) {
    this.options = { ...options };
  }

  isEnabled() {
    /* istanbul ignore if */
    if (typeof window === 'undefined') {
      return false;
    }

    const random = String(Date.now());
    const testStrorage = new CookieStorage<string>();
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
    const value = this.getRaw(key);
    if (!value) {
      return undefined;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(value);
    } catch {
      /* istanbul ignore next */
      return undefined;
    }
  }

  getRaw(key: string): string | undefined {
    const cookie = window.document.cookie.split('; ');
    const match = cookie.find((c) => c.indexOf(key + '=') === 0);
    if (!match) {
      return undefined;
    }
    return match.substring(key.length + 1);
  }

  set(key: string, value: T | null) {
    try {
      const expirationDays = this.options.expirationDays ?? 0;
      const expires = value !== null ? expirationDays : -1;
      let expireDate: Date | undefined = undefined;
      if (expires) {
        const date = new Date();
        date.setTime(date.getTime() + expires * 24 * 60 * 60 * 1000);
        expireDate = date;
      }
      let str = `${key}=${JSON.stringify(value)}`;
      if (expireDate) {
        str += `; expires=${expireDate.toUTCString()}`;
      }
      str += '; path=/';
      if (this.options.domain) {
        str += `; domain=${this.options.domain}`;
      }
      if (this.options.secure) {
        str += '; Secure';
      }
      if (this.options.sameSite) {
        str += `; SameSite=${this.options.sameSite}`;
      }
      window.document.cookie = str;
    } catch {
      //
    }
  }

  remove(key: string) {
    this.set(key, null);
  }

  reset() {
    return;
  }
}
