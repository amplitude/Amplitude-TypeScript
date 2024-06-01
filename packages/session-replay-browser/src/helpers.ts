import { getGlobalScope } from '@amplitude/analytics-client-common';
import { MASK_TEXT_CLASS, UNMASK_TEXT_CLASS } from './constants';
import { DEFAULT_MASK_LEVEL, MaskLevel, PrivacyConfig } from './config/types';
import { getInputType } from '@amplitude/rrweb-snapshot';

// compiler guard
/* istanbul ignore next */ // TODO(lew): figure out a way to test this.
const assertUnreachable = (_: never): never => {
  throw new Error('did not expect to get here');
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
      return elementType === 'input';
    case 'conservative':
      return elementType === 'input' || elementType === 'text';
  }

  /* istanbul ignore next */ // TODO (lew): figure out a way to test this.
  return assertUnreachable(level);
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
    // Element is explicitly instrumented in code to mask
    if (element.classList && element.classList.contains(MASK_TEXT_CLASS)) {
      return true;
    }

    // Config has override for mask
    const shouldMask = (config.maskSelector ?? []).some((selector) => element.matches(selector));
    if (shouldMask) {
      return true;
    }

    // Code or config has override to unmask
    if (element.classList && element.classList.contains(UNMASK_TEXT_CLASS)) {
      return false;
    }
    const shouldUnmask = (config.unmaskSelector ?? []).some((selector) => element.matches(selector));
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
  const mod = absHashMultiply % 100;
  return mod / 100 < sampleRate;
};

export const getCurrentUrl = () => {
  const globalScope = getGlobalScope();
  return globalScope?.location ? globalScope.location.href : '';
};

export const generateSessionReplayId = (sessionId: number, deviceId: string): string => {
  return `${deviceId}/${sessionId}`;
};
