import { Storage, CookieStorageOptions } from '@amplitude/analytics-types';
import { getGlobalScope } from '../global-scope';

export class CookieStorage<T> implements Storage<T> {
  options: CookieStorageOptions;
  private static testValue: undefined | string;

  constructor(options?: CookieStorageOptions) {
    this.options = { ...options };
  }

  async isEnabled(): Promise<boolean> {
    /* istanbul ignore if */
    if (!getGlobalScope()) {
      return false;
    }

    CookieStorage.testValue = String(Date.now());
    const testStrorage = new CookieStorage<string>(this.options);
    const testKey = 'AMP_TEST';
    try {
      await testStrorage.set(testKey, CookieStorage.testValue);
      const value = await testStrorage.get(testKey);
      return value === CookieStorage.testValue;
    } catch {
      /* istanbul ignore next */
      return false;
    } finally {
      await testStrorage.remove(testKey);
    }
  }

  async get(key: string): Promise<T | undefined> {
    let value = await this.getRaw(key);
    if (!value) {
      return undefined;
    }
    try {
      try {
        value = decodeURIComponent(atob(value));
      } catch {
        // value not encoded
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(value);
    } catch {
      /* istanbul ignore next */
      return undefined;
    }
  }

  async getRaw(key: string): Promise<string | undefined> {
    const globalScope = getGlobalScope();
    const cookie = globalScope?.document?.cookie.split('; ') ?? [];
    const match = cookie.find((c) => c.indexOf(key + '=') === 0);
    if (!match) {
      return undefined;
    }
    return match.substring(key.length + 1);
  }

  async set(key: string, value: T | null): Promise<void> {
    try {
      const expirationDays = this.options.expirationDays ?? 0;
      const expires = value !== null ? expirationDays : -1;
      let expireDate: Date | undefined = undefined;
      if (expires) {
        const date = new Date();
        date.setTime(date.getTime() + expires * 24 * 60 * 60 * 1000);
        expireDate = date;
      }
      let str = `${key}=${btoa(encodeURIComponent(JSON.stringify(value)))}`;
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
      const globalScope = getGlobalScope();
      if (globalScope) {
        globalScope.document.cookie = str;
      }
    } catch {
      //
    }
  }

  async remove(key: string): Promise<void> {
    await this.set(key, null);
  }

  async reset(): Promise<void> {
    return;
  }
}
