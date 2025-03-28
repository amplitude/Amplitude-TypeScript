import { CookieStorageOptions, Storage } from '../types/storage';
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
    const value = await this.getRaw(key);
    if (!value) {
      return undefined;
    }
    try {
      const decodedValue = decodeCookiesAsDefault(value) ?? decodeCookiesWithDoubleUrlEncoding(value);
      if (decodedValue === undefined) {
        console.error(`Amplitude Logger [Error]: Failed to decode cookie value for key: ${key}, value: ${value}`);
        return undefined;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(decodedValue);
    } catch {
      console.error(`Amplitude Logger [Error]: Failed to parse cookie value for key: ${key}, value: ${value}`);
      return undefined;
    }
  }

  /* istanbul ignore next */
  async getRaw(key: string): Promise<string | undefined> {
    const globalScope = getGlobalScope();
    const cookieString = globalScope?.document?.cookie ?? '';
    const cookies = cookieString.split('; ').filter((c) => c.startsWith(key + '='));

    if (cookies.length === 0) {
      return undefined;
    }

    // If only one cookie, return its value
    if (cookies.length === 1) {
      return cookies[0].substring(key.length + 1);
    } else {
      // If two cookies, remove the one without the leading dot.
      // For example: .amplitude.com stays while amplitude.com is deleted
      if (this.options.domain?.startsWith('.')) {
        const removalOptions = {
          ...this.options,
          domain: this.options.domain?.substring(1),
        };

        const tempStorage = new CookieStorage<string>(removalOptions);
        await tempStorage.remove(key);
      }

      // Return the remaining cookie
      const refreshedCookies = globalScope?.document?.cookie.split('; ').filter((c) => c.startsWith(key + '=')) ?? [];
      const match = refreshedCookies.find((c) => c.startsWith(key + '='));
      return match?.substring(key.length + 1);
    }
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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Amplitude Logger [Error]: Failed to set cookie for key: ${key}. Error: ${errorMessage}`);
    }
  }

  async remove(key: string): Promise<void> {
    await this.set(key, null);
  }

  async reset(): Promise<void> {
    return;
  }
}

const decodeCookiesAsDefault = (value: string): string | undefined => {
  try {
    return decodeURIComponent(atob(value));
  } catch {
    return undefined;
  }
};

const decodeCookiesWithDoubleUrlEncoding = (value: string): string | undefined => {
  // Modern Ruby (v7+) automatically encodes cookies with URL encoding by
  // https://api.rubyonrails.org/classes/ActionDispatch/Cookies.html
  try {
    return decodeURIComponent(atob(decodeURIComponent(value)));
  } catch {
    return undefined;
  }
};
