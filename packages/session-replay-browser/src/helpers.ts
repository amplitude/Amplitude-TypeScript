import { getGlobalScope } from '@amplitude/analytics-client-common';
import { KB_SIZE, MASK_TEXT_CLASS, UNMASK_TEXT_CLASS } from './constants';
import { DEFAULT_MASK_LEVEL, MaskLevel, PrivacyConfig } from './config/types';
import { getInputType } from '@amplitude/rrweb-snapshot';
import { ServerZone } from '@amplitude/analytics-types';
import {
  SESSION_REPLAY_EU_URL as SESSION_REPLAY_EU_SERVER_URL,
  SESSION_REPLAY_SERVER_URL,
  SESSION_REPLAY_STAGING_URL as SESSION_REPLAY_STAGING_SERVER_URL,
} from './constants';
import { StorageData } from './typings/session-replay';

type ChromeStorageEstimate = {
  quota?: number;
  usage?: number;
  usageDetails?: { [key: string]: number };
};

/**
 * Light: Subset of inputs
 * Medium: All inputs
 * Conservative: All inputs and all texts
 */
const isMaskedForLevel = (elementType: 'input' | 'text', level: MaskLevel, element: HTMLElement | null): boolean => {
  switch (level) {
    case 'light': {
      if (elementType !== 'input') {
        return true;
      }

      const inputType = element ? getInputType(element) : '';
      /* istanbul ignore if */ // TODO(lew): For some reason it's impossible to test this.
      if (!inputType) {
        return false;
      }

      if (['password', 'hidden', 'email', 'tel'].includes(inputType)) {
        return true;
      }

      if ((element as HTMLInputElement).autocomplete.startsWith('cc-')) {
        return true;
      }

      return false;
    }
    case 'medium':
    case 'conservative':
      return true;
    default:
      return isMaskedForLevel(elementType, DEFAULT_MASK_LEVEL, element);
  }
};

/**
 * Checks if the given element set to be masked by rrweb
 *
 * Priority is:
 *  1. [In code] Element/class based masking/unmasking <> [Config based] Selector based masking/unmasking
 *  2. Use app defaults
 */
const isMasked = (
  elementType: 'input' | 'text',
  config: PrivacyConfig = { defaultMaskLevel: DEFAULT_MASK_LEVEL },
  element: HTMLElement | null,
): boolean => {
  if (element) {
    // Element or parent is explicitly instrumented in code to mask
    if (element.closest('.' + MASK_TEXT_CLASS)) {
      return true;
    }

    // Config has override for mask
    const shouldMask = (config.maskSelector ?? []).some((selector) => element.closest(selector));
    if (shouldMask) {
      return true;
    }

    // Code or config has override to unmask
    if (element.closest('.' + UNMASK_TEXT_CLASS)) {
      return false;
    }

    // Here we are probably sent an element, but we want to match if they have a
    // parent with an unmask selector.
    const shouldUnmask = (config.unmaskSelector ?? []).some((selector) => element.closest(selector));
    if (shouldUnmask) {
      return false;
    }
  }

  return isMaskedForLevel(elementType, config.defaultMaskLevel ?? DEFAULT_MASK_LEVEL, element);
};

export const maskFn =
  (elementType: 'text' | 'input', config?: PrivacyConfig) =>
  (text: string, element: HTMLElement | null): string => {
    return isMasked(elementType, config, element) ? text.replace(/[^\s]/g, '*') : text;
  };

export const generateHashCode = function (str: string) {
  let hash = 0;
  if (str.length === 0) return hash;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash;
};

export const isSessionInSample = function (sessionId: number, sampleRate: number) {
  const hashNumber = generateHashCode(sessionId.toString());
  const absHash = Math.abs(hashNumber);
  const absHashMultiply = absHash * 31;
  const mod = absHashMultiply % 1000000;
  return mod / 1000000 < sampleRate;
};

export const getCurrentUrl = () => {
  const globalScope = getGlobalScope();
  return globalScope?.location ? globalScope.location.href : '';
};

export const generateSessionReplayId = (sessionId: number, deviceId: string): string => {
  return `${deviceId}/${sessionId}`;
};

export const getServerUrl = (serverZone?: keyof typeof ServerZone): string => {
  if (serverZone === ServerZone.STAGING) {
    return SESSION_REPLAY_STAGING_SERVER_URL;
  }

  if (serverZone === ServerZone.EU) {
    return SESSION_REPLAY_EU_SERVER_URL;
  }

  return SESSION_REPLAY_SERVER_URL;
};

export const getStorageSize = async (): Promise<StorageData> => {
  const globalScope = getGlobalScope();
  if (globalScope) {
    const storeEstimate: ChromeStorageEstimate = await globalScope.navigator.storage.estimate();
    const totalStorageSize = storeEstimate.usage ? Math.round(storeEstimate.usage / KB_SIZE) : 0;
    const percentOfQuota =
      storeEstimate.usage && storeEstimate.quota
        ? Math.round((storeEstimate.usage / storeEstimate.quota + Number.EPSILON) * 1000) / 1000
        : 0;
    return { totalStorageSize, percentOfQuota, usageDetails: JSON.stringify(storeEstimate.usageDetails) };
  }
  return { totalStorageSize: 0, percentOfQuota: 0, usageDetails: '' };
};
