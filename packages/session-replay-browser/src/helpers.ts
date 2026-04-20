import { getGlobalScope } from '@amplitude/analytics-core';
import { DEFAULT_MASK_LEVEL, MaskLevel, PrivacyConfig, SessionReplayJoinedConfig, UGCFilterRule } from './config/types';
import { KB_SIZE, MASK_TEXT_CLASS, UNMASK_TEXT_CLASS } from './constants';
import { StorageData } from './typings/session-replay';
import { getInputType } from './utils/get-input-type';
export { getServerUrl } from './utils/server-url';

type ChromeStorageEstimate = {
  quota?: number;
  usage?: number;
  usageDetails?: { [key: string]: number };
};

/**
 * Light: Subset of inputs (sensitive types only — password, hidden, email, tel, cc-*)
 * Medium: All inputs
 * Conservative: All inputs and all texts
 */
const isMaskedForLevel = (elementType: 'input' | 'text', level: MaskLevel, element: HTMLElement | null): boolean => {
  switch (level) {
    case 'light': {
      if (elementType !== 'input') {
        // light only masks a subset of inputs; text nodes are not masked at this level.
        return false;
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
      return elementType === 'input';
    case 'conservative':
      return true;
    default:
      return isMaskedForLevel(elementType, DEFAULT_MASK_LEVEL, element);
  }
};

/**
 * Returns the effective mask level for a given URL by checking `urlMaskLevels`
 * (first match wins) and falling back to `defaultMaskLevel`.
 */
export const getEffectiveMaskLevel = (url: string | undefined, config: PrivacyConfig): MaskLevel => {
  if (url && config.urlMaskLevels) {
    for (const rule of config.urlMaskLevels) {
      if (globToRegex(rule.match).test(url)) {
        return rule.maskLevel;
      }
    }
  }
  return config.defaultMaskLevel ?? DEFAULT_MASK_LEVEL;
};

/**
 * Checks if the given element set to be masked by rrweb
 *
 * Priority is:
 *  1. [In code] Element/class based masking/unmasking <> [Config based] Selector based masking/unmasking
 *  2. Use app defaults
 */
export const isMasked = (
  elementType: 'input' | 'text',
  config: PrivacyConfig = { defaultMaskLevel: DEFAULT_MASK_LEVEL },
  element: HTMLElement | null,
  currentUrl?: string,
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

  return isMaskedForLevel(elementType, getEffectiveMaskLevel(currentUrl, config), element);
};

export const maskFn =
  (elementType: 'text' | 'input', config?: PrivacyConfig, getCurrentUrl?: () => string) =>
  (text: string, element: HTMLElement | null): string => {
    return isMasked(elementType, config, element, getCurrentUrl?.()) ? text.replace(/[^\s]/g, '*') : text;
  };

export const maskAttributeFn = (config?: PrivacyConfig, getCurrentUrl?: () => string) => {
  return (key: string, value: string, element: HTMLElement): string => {
    // Never mask style — rrweb has a separate styleDiff path for attribute mutations
    // that reads directly from the DOM, bypassing maskAttributeFn.
    if (key === 'style') return value;

    // Short-circuit: only proceed if this attribute is in the allowlist.
    if (!(config?.maskAttributes ?? []).includes(key)) return value;

    // Recompute masking every call so class/ancestor mutations do not stale-cache
    // the decision for later attribute mutations on the same element.
    // Use 'input' as the element type: maskAttributes is an explicit override that applies
    // to any element tag at medium/conservative level. At light level, isMaskedForLevel
    // for 'input' returns false for non-sensitive types, naturally skipping masking.
    return isMasked('input', config, element, getCurrentUrl?.()) ? value.replace(/[^\s]/g, '*') : value;
  };
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

const globRegexCache = new Map<string, RegExp>();

const globToRegex = (glob: string): RegExp => {
  const cached = globRegexCache.get(glob);
  if (cached) return cached;

  // Glob → regex conversion. Glob substitution must happen BEFORE regex escaping so that
  // the escaper does not corrupt the glob characters (e.g. turning `/**` into `/\*\*`).
  // Placeholder tokens use null bytes, which are illegal in HTTP URLs and therefore can
  // never collide with real pattern content.
  //
  // Substitution order (most-specific first):
  //   trailing /**   → (/.*)?          — path with or without a trailing slash/subpath
  //   middle  /**/   → /(.*\/)?        — zero-or-more path segments (including zero)
  //   bare    **     → .*              — graceful fallback for ** not adjacent to /
  //   single  *      → .*              — any characters (preserves existing behaviour)
  //   ?              → .               — single character wildcard
  const T_TRAILING = '\x00TRAIL\x00';
  const T_MIDDLE = '\x00MID\x00';
  const T_DSTAR = '\x00DS\x00';
  const T_STAR = '\x00ST\x00';
  const T_QUEST = '\x00QU\x00';

  let s = glob;
  s = s.replace(/\/\*\*$/, T_TRAILING); // trailing /**
  s = s.replace(/\/\*\*\//g, T_MIDDLE); // /**/ in the middle
  s = s.replace(/\*\*/g, T_DSTAR); // bare ** (e.g. **.example.com)
  s = s.replace(/\*/g, T_STAR); // single *
  s = s.replace(/\?/g, T_QUEST); // ?

  // Escape all remaining regex special characters.
  s = s.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Expand tokens into their regex equivalents.
  // Use split/join (not regex) to avoid the no-control-regex lint rule on the token strings.
  s = s.split(T_TRAILING).join('(/.*)?'); // /** → optional /anything
  s = s.split(T_MIDDLE).join('/(.*\\/)?'); // /**/ → /zero-or-more-segments/
  s = s.split(T_DSTAR).join('.*'); // bare ** → .*
  s = s.split(T_STAR).join('.*'); // * → .*
  s = s.split(T_QUEST).join('.'); // ? → .

  const regex = new RegExp(`^${s}$`);
  globRegexCache.set(glob, regex);
  return regex;
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
