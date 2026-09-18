import { getGlobalScope } from '@amplitude/analytics-core';
import { SessionReplayJoinedConfig, UGCFilterRule } from './config/types';
import { KB_SIZE } from './constants';
import { StorageData } from './typings/session-replay';
import { globToRegex } from '@amplitude/session-replay-dom-privacy';
export { getEffectiveMaskLevel, isMasked, maskFn, maskAttributeFn } from '@amplitude/session-replay-dom-privacy';
export { getServerUrl } from './utils/server-url';

type ChromeStorageEstimate = {
  quota?: number;
  usage?: number;
  usageDetails?: { [key: string]: number };
};

export const getCurrentUrl = () => {
  const globalScope = getGlobalScope();
  return globalScope?.location ? globalScope.location.href : '';
};

export const generateSessionReplayId = (sessionId: string | number, deviceId: string): string => {
  return `${deviceId}/${sessionId}`;
};

const isValidGlobUrl = (globUrl: string): boolean => {
  if (typeof globUrl !== 'string' || globUrl.trim() === '') return false;
  const urlPattern = /^\/|^https?:\/\/[^\s]+$/;
  if (!urlPattern.test(globUrl)) return false;
  return true;
};

export const validateUGCFilterRules = (ugcFilterRules: UGCFilterRule[]) => {
  // validate ugcFilterRules
  if (!ugcFilterRules.every((rule) => typeof rule.selector === 'string' && typeof rule.replacement === 'string')) {
    throw new Error('ugcFilterRules must be an array of objects with selector and replacement properties');
  }

  // validate ugcFilterRules are valid globs
  if (!ugcFilterRules.every((rule) => isValidGlobUrl(rule.selector))) {
    throw new Error('ugcFilterRules must be an array of objects with valid globs');
  }
};

export const getPageUrl = (pageUrl: string, ugcFilterRules: UGCFilterRule[]) => {
  // apply ugcFilterRules, order is important, first rule wins
  for (const rule of ugcFilterRules) {
    const regex = globToRegex(rule.selector);

    if (regex.test(pageUrl)) {
      return pageUrl.replace(regex, rule.replacement);
    }
  }

  return pageUrl;
};

export const getStorageSize = async (): Promise<StorageData> => {
  try {
    const globalScope = getGlobalScope();
    if (globalScope) {
      const { usage, quota, usageDetails }: ChromeStorageEstimate = await globalScope.navigator.storage.estimate();
      const totalStorageSize = usage ? Math.round(usage / KB_SIZE) : 0;
      const percentOfQuota = usage && quota ? Math.round((usage / quota + Number.EPSILON) * 1000) / 1000 : 0;
      return { totalStorageSize, percentOfQuota, usageDetails: JSON.stringify(usageDetails) };
    }
  } catch (e) {
    // swallow
  }
  return { totalStorageSize: 0, percentOfQuota: 0, usageDetails: '' };
};

export const getDebugConfig = (config: SessionReplayJoinedConfig): SessionReplayJoinedConfig => {
  const debugConfig = {
    ...config,
  };
  const { apiKey } = debugConfig;
  debugConfig.apiKey = `****${apiKey.substring(apiKey.length - 4)}`;
  return debugConfig;
};
