import { BrowserOptions, Storage, UserSession } from '@amplitude/analytics-types';
import { getOldCookieName } from '../utils/cookie-name';
import { LocalStorage } from '../storage/local-storage';
import { CookieStorage } from '../storage/cookie';

export const parseOldCookies = (apiKey: string, options?: BrowserOptions): UserSession => {
  let storage: Storage<string> = new CookieStorage<string>();
  if (!storage.isEnabled() || options?.disableCookies) {
    storage = new LocalStorage<string>();
  }
  if (!storage.isEnabled()) {
    return {
      optOut: false,
    };
  }

  const oldCookieName = getOldCookieName(apiKey);
  const cookies = storage.getRaw(oldCookieName);

  if (!cookies) {
    return {
      optOut: false,
    };
  }

  storage.remove(oldCookieName);
  const [deviceId, userId, optOut, sessionId, lastEventTime] = cookies.split('.');
  return {
    deviceId,
    userId: decode(userId),
    sessionId: parseTime(sessionId),
    lastEventTime: parseTime(lastEventTime),
    optOut: Boolean(optOut),
  };
};

export const parseTime = (num: string) => {
  const integer = parseInt(num, 32);
  if (isNaN(integer)) {
    return undefined;
  }
  return integer;
};

export const decode = (value?: string): string | undefined => {
  if (!atob || !escape || !value) {
    return undefined;
  }
  try {
    return decodeURIComponent(escape(atob(value)));
  } catch {
    return undefined;
  }
};
