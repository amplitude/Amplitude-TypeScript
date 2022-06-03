import { AMPLITUDE_PREFIX } from '@amplitude/analytics-core';

export const getCookieName = (apiKey: string, postKey = '', limit = 10) => {
  return [AMPLITUDE_PREFIX, postKey, apiKey.substring(0, limit)].filter(Boolean).join('_');
};

export const getOldCookieName = (apiKey: string) => {
  return `${AMPLITUDE_PREFIX.toLowerCase()}_${apiKey.substring(0, 6)}`;
};
