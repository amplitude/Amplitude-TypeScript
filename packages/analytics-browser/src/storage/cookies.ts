import { Storage } from '@amplitude/analytics-types';

interface CookieOptions {
  domain?: string;
  expirationDays?: number;
  sameSite?: string;
  secure?: boolean;
}
export class Cookies implements Storage {
  options: CookieOptions;

  constructor(options?: CookieOptions) {
    this.options = { ...options };
  }

  isEnabled() {
    const random = String(Date.now());
    try {
      this.set(random, random);
      return this.get(random) === random;
    } catch {
      return false;
    } finally {
      this.set(random, null);
    }
  }

  get(key: string): string | null {
    try {
      const cookie = window.document.cookie.split('; ');
      const match = cookie.find((c) => {
        const start = c.indexOf(key + '=');
        return start === 0;
      });
      if (!match) {
        return null;
      }
      return match.substring(key.length + 1);
    } catch {
      /* istanbul ignore next */
      return null;
    }
  }

  set(key: string, value: string | null, options?: CookieOptions) {
    try {
      const expires = value !== null ? options?.expirationDays : -1;
      let expireDate: Date | undefined = undefined;
      if (expires) {
        const date = new Date();
        date.setTime(date.getTime() + expires * 24 * 60 * 60 * 1000);
        expireDate = date;
      }
      let str = `${key}=${String(value)}`;
      if (expireDate) {
        str += `; expires=${expireDate.toUTCString()}`;
      }
      str += '; path=/';
      if (options?.domain) {
        str += `; domain=${options.domain}`;
      }
      if (options?.secure) {
        str += '; Secure';
      }
      if (options?.sameSite) {
        str += `; SameSite=${options.sameSite}`;
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
