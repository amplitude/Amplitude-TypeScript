import { BrowserConfig } from '@amplitude/analytics-types';
import { AMPLITUDE_PREFIX } from '@amplitude/analytics-core';

export const updateCookies = (config: BrowserConfig, lastEventTime?: number) => {
  const cookieName = getCookieName(config.apiKey);
  config.cookieStorage.set(cookieName, {
    userId: config.userId,
    deviceId: config.deviceId,
    sessionId: config.sessionId,
    lastEventTime: lastEventTime ?? config.cookieStorage.get(cookieName)?.lastEventTime,
    optOut: Boolean(config.optOut),
  });
};

export const checkSessionExpiry = (config: BrowserConfig) => {
  const cookieName = getCookieName(config.apiKey);
  const lastEventTime = config.cookieStorage.get(cookieName)?.lastEventTime;
  const now = Date.now();
  if (lastEventTime && now - lastEventTime >= config.sessionTimeout) {
    config.sessionId = now;
    updateCookies(config);
  }
};

export const getCookieName = (apiKey: string, limit = 10) => {
  return `${AMPLITUDE_PREFIX}_${apiKey.substring(0, limit)}`;
};

export const getOldCookieName = (apiKey: string) => {
  return `${AMPLITUDE_PREFIX.toLowerCase()}_${apiKey.substring(0, 6)}`;
};
