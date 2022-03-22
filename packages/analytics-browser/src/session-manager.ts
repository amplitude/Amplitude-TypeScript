import { BrowserConfig } from '@amplitude/analytics-types';
import { AMPLITUDE_PREFIX } from '@amplitude/analytics-core';

export const updateCookies = (config: BrowserConfig) => {
  const cookieName = getCookieName(config.apiKey);
  config.cookieStorage.set(cookieName, {
    userId: config.userId,
    deviceId: config.deviceId,
    sessionId: config.sessionId,
    lastEventTime: config.cookieStorage.get(cookieName)?.lastEventTime,
  });
};

export const updateLastEventTime = (config: BrowserConfig, lastEventTime: number) => {
  const cookieName = getCookieName(config.apiKey);
  config.cookieStorage.set(cookieName, {
    userId: config.userId,
    deviceId: config.deviceId,
    sessionId: config.sessionId,
    lastEventTime: lastEventTime,
  });
};

export const getCookieName = (apiKey: string) => {
  return `${AMPLITUDE_PREFIX}_${apiKey.substring(0, 10)}`;
};
