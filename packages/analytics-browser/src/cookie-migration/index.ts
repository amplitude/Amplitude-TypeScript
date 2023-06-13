import { Storage, UserSession } from '@amplitude/analytics-types';
import { getOldCookieName } from '@amplitude/analytics-client-common';

export const parseLegacyCookies = async (
  apiKey: string,
  cookieStorage: Storage<UserSession>,
  deleteLegacyCookies = true,
): Promise<UserSession> => {
  const cookieName = getOldCookieName(apiKey);
  const cookies = await cookieStorage.getRaw(cookieName);
  if (!cookies) {
    return {
      optOut: false,
    };
  }
  if (deleteLegacyCookies) {
    await cookieStorage.remove(cookieName);
  }
  const [deviceId, userId, optOut, sessionId, lastEventTime, lastEventId] = cookies.split('.');
  return {
    deviceId,
    userId: decode(userId),
    sessionId: parseTime(sessionId),
    lastEventId: parseTime(lastEventId),
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
