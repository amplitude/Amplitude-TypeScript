import { CookieStorage } from './cookie';

export class UTMCookie extends CookieStorage<Record<string, string | undefined>> {
  get(key: string) {
    try {
      const value = this.findByKey(key);
      if (!value) {
        return undefined;
      }
      const entries = value.split('.').splice(-1)[0].split('|');
      return entries.reduce<Record<string, string | undefined>>((acc, curr) => {
        const [key, value = ''] = curr.split('=', 2);
        if (!value) {
          return acc;
        }
        acc[key] = decodeURIComponent(value);
        return acc;
      }, {});
    } catch {
      return undefined;
    }
  }

  set() {
    return undefined;
  }
}
