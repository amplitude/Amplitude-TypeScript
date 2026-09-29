import { DEFAULT_MASK_LEVEL, MaskLevel, PrivacyConfig } from './types';
import { getInputType } from './get-input-type';
import { globToRegex } from './url';

/**
 * Light: Subset of inputs (sensitive types only — password, hidden, email, tel, cc-*)
 * Medium: All inputs (form fields), text is NOT masked
 * Conservative: All inputs and all texts
 */
const isMaskedForLevel = (elementType: 'input' | 'text', level: MaskLevel, element: HTMLElement | null): boolean => {
  switch (level) {
    case 'light': {
      if (elementType !== 'input') {
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
    if (element.closest('.amp-mask, [data-amp-mask]')) {
      return true;
    }

    // Config has override for mask
    const shouldMask = (config.maskSelector ?? []).some((selector) => element.closest(selector));
    if (shouldMask) {
      return true;
    }

    // Code or config has override to unmask
    if (element.closest('.amp-unmask, [data-amp-unmask]')) {
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

    // Use 'input' for form elements so that `medium` (which masks inputs but not text)
    // still masks attributes on inputs/selects/textareas. For non-form elements, use
    // 'text' so medium leaves them visible.
    const elementType = ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) ? 'input' : 'text';
    return isMasked(elementType, config, element, getCurrentUrl?.()) ? value.replace(/[^\s]/g, '*') : value;
  };
};
