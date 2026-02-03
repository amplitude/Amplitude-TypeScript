import { Storage, CookieStorageOptions, CookieStorageConfig } from '../types/storage';
import { getGlobalScope } from '../global-scope';
import { UUID } from '../utils/uuid';

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
  getAll(key: string): Promise<CookieStoreSetOptions[] | undefined>;
}

type GlobalScopeWithCookieStore = {
  cookieStore?: CookieStore;
} & typeof global;

export class CookieStorage<T> implements Storage<T> {
  options: CookieStorageOptions;
  config: CookieStorageConfig;
  private static testValue: undefined | string;

  constructor(options?: CookieStorageOptions, config: CookieStorageConfig = {}) {
    this.options = { ...options };
    this.config = config;
  }

  async isEnabled(): Promise<boolean> {
    /* istanbul ignore if */
    if (!getGlobalScope()) {
      return false;
    }

    CookieStorage.testValue = String(Date.now());
    const testCookieOptions = {
      ...this.options,
      expirationDays: 0.003, // expire in ~5 minutes
    };
    const testStorage = new CookieStorage<string>(testCookieOptions);
    const testKey = `AMP_TEST_${UUID().substring(0, 8)}`;
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
      const decodedValue = decodeCookieValue(value);
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
    try {
      const cookieStore = globalScopeWithCookiesStore?.cookieStore;
      if (cookieStore) {
        const cookies = await cookieStore.getAll(key);
        if (cookies) {
          /* istanbul ignore if */
          if (cookies.length > 1) {
            this.config.diagnosticsClient?.recordEvent('cookies.duplicate', {
              cookies: cookies.map((cookie) => cookie.domain),
            });
            this.config.diagnosticsClient?.increment('cookies.duplicate.occurrence.cookieStore');
          }

          for (const cookie of cookies) {
            if (isDomainEqual(cookie.domain, this.options.domain)) {
              return cookie.value;
            }
          }
        }
      }
    } catch (ignoreError) {
      /* istanbul ignore next */
      // if cookieStore had a surprise failure, fallback to document.cookie
    }

    const cookies = (globalScope?.document?.cookie.split('; ') ?? []).filter((c) => c.indexOf(key + '=') === 0);
    let match: string | undefined = undefined;

    // if matcher function is provided, use it to de-duplicate when there's more than one cookie
    /* istanbul ignore if */
    const duplicateResolverFn = this.config.duplicateResolverFn;
    if (typeof duplicateResolverFn === 'function' && cookies.length > 1) {
      match = cookies.find((c) => {
        try {
          const res = duplicateResolverFn(c.substring(key.length + 1));
          if (!res) {
            this.config.diagnosticsClient?.increment('cookies.duplicate.occurrence.document.cookie');
          }
          return res;
        } catch (ignoreError) {
          /* istanbul ignore next */
          return false;
        }
      });
    }

    // if match was not found, just get the first one that matches the key
    if (!match) {
      match = cookies[0];
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
 * Decodes a cookie value that was encoded with btoa(encodeURIComponent(...)).
 * Handles both standard encoding and double URL encoding (used by Ruby Rails v7+).
 */
export const decodeCookieValue = (value: string): string | undefined => {
  return decodeCookiesAsDefault(value) ?? decodeCookiesWithDoubleUrlEncoding(value);
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
  return normalized1.toLowerCase() === normalized2.toLowerCase();
};
