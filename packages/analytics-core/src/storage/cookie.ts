import { Storage, CookieStorageOptions } from '../types/storage';
import { getGlobalScope } from '../global-scope';

// CookieStore is a Web API not included in standard TypeScript lib types
// https://developer.mozilla.org/en-US/docs/Web/API/CookieStore
interface CookieStoreSetOptions {
  name: string;
  value: string;
  expires?: number;
  domain?: string;
  sameSite?: 'strict' | 'lax' | 'none';
}

interface CookieStore {
  set(key: string, value: string): Promise<void>;
  set(options: CookieStoreSetOptions): Promise<void>;
  get(key: string): Promise<string | undefined>;
  getAll(key: string): Promise<CookieStoreSetOptions[] | undefined>;
}

type GlobalScopeWithCookieStore = {
  cookieStore?: CookieStore;
} & typeof global;

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
    const testStorage = new CookieStorage<string>(this.options);
    const testKey = 'AMP_TEST';
    try {
      await testStorage.set(testKey, CookieStorage.testValue);
      const value = await testStorage.get(testKey);
      return value === CookieStorage.testValue;
    } catch {
      /* istanbul ignore next */
      return false;
    } finally {
      await testStorage.remove(testKey);
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

  async getRaw(key: string): Promise<string | undefined> {
    const globalScope = getGlobalScope();

    // use CookieStore if available and enabled
    const globalScopeWithCookiesStore = globalScope as GlobalScopeWithCookieStore;
    /* istanbul ignore if */
    try {
      const cookieStore = globalScopeWithCookiesStore?.cookieStore;
      if (cookieStore) {
        const cookies = await cookieStore.getAll(key);
        if (cookies) {
          for (const cookie of cookies) {
            /* istanbul ignore if */
            if (!cookie.domain) {
              continue;
            }
            if (this.options.domain && isDomainEqual(cookie.domain, this.options.domain)) {
              return cookie.value;
            }
          }
        }
      }
    } catch (ignoreError) {
      /* istanbul ignore next */
      // if cookieStore had a surprise failure, fallback to document.cookie
    }

    const cookie = globalScope?.document?.cookie.split('; ') ?? [];
    let match: string | undefined = undefined;

    // if matcher function is provided, use a matcher function to
    // de-duplicate when there's more than one cookie
    const duplicateResolverFn = this.options.duplicateResolverFn;
    if (duplicateResolverFn) {
      cookie.forEach((c) => {
        // skip if not the correct key
        if (!(c.indexOf(key + '=') === 0)) {
          return;
        }

        // run matcher fn against the value
        const value = c.substring(key.length + 1);
        try {
          if (duplicateResolverFn(value)) {
            match = c;
            return false;
          }
        } catch (ignoreError) {
          /* istanbul ignore next */
        }
        return;
      });
    }

    // if match was not found, just get the first one that matches the key
    if (!match) {
      match = cookie.find((c) => c.indexOf(key + '=') === 0);
    }
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

/**
 * Compares two domain strings for equality, ignoring leading dots.
 * This is useful for comparing cookie domains since ".example.com" and "example.com"
 * are effectively equivalent for cookie scoping.
 */
export const isDomainEqual = (domain1: string | undefined, domain2: string | undefined): boolean => {
  if (!domain1 || !domain2) {
    return false;
  }
  const normalized1 = domain1.startsWith('.') ? domain1.substring(1) : domain1;
  const normalized2 = domain2.startsWith('.') ? domain2.substring(1) : domain2;
  return normalized1 === normalized2;
};
