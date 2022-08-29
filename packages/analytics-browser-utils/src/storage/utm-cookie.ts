import { CookieStorage } from './cookie';

export class UTMCookie extends CookieStorage<Record<string, string | undefined>> {
  async get(key: string): Promise<Record<string, string | undefined> | undefined> {
    try {
      const value = await this.getRaw(key);
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

  async set(): Promise<void> {
    return undefined;
  }
}
