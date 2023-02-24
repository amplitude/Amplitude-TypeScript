import { BrowserOptions, UserSession } from '@amplitude/analytics-types';
import { getOldCookieName } from '@amplitude/analytics-client-common';
import { createCookieStorage, getDefaultConfig, getTopLevelDomain } from '../config';

export const parseOldCookies = async (apiKey: string, options?: BrowserOptions): Promise<UserSession> => {
  const storage = await createCookieStorage<string>({
    ...options,
    domain: options?.disableCookies ? '' : options?.domain ?? (await getTopLevelDomain()),
  });
  const oldCookieName = getOldCookieName(apiKey);
  const cookies = await storage.getRaw(oldCookieName);

  if (!cookies) {
    return {
      optOut: false,
    };
  }

  if (options?.cookieUpgrade ?? getDefaultConfig().cookieUpgrade) {
    await storage.remove(oldCookieName);
  }
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
