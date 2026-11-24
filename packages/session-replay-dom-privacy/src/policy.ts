import { DEFAULT_MASK_LEVEL, MaskLevel, PrivacyConfig } from './types';
import { getInputType } from './get-input-type';
import { globToRegex } from './url';

/**
 * Light: Subset of inputs (sensitive types only — password, hidden, email, tel, cc-*)
 * Medium: All inputs (form fields), text is NOT masked
 * Conservative: All inputs and all texts
 */
const isPasswordInput = (element: HTMLElement | null): boolean => !!element && getInputType(element) === 'password';

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

type MaskDecision = 'explicit' | 'level' | 'none';

/**
 * Explains why an element is masked. `explicit` means code or config named the element
 * (`amp-mask`, `maskSelector`), `level` means the mask level masked it by default.
 * Custom mask callbacks only apply to `level` decisions.
 */
const getMaskDecision = (
  elementType: 'input' | 'text',
  config: PrivacyConfig,
  element: HTMLElement | null,
  currentUrl?: string,
): MaskDecision => {
  if (element) {
    // Element or parent is explicitly instrumented in code to mask
    if (element.closest('.amp-mask, [data-amp-mask]')) {
      return 'explicit';
    }

    // Config has override for mask
    const shouldMask = (config.maskSelector ?? []).some((selector) => element.closest(selector));
    if (shouldMask) {
      return 'explicit';
    }

    // Code or config has override to unmask
    if (element.closest('.amp-unmask, [data-amp-unmask]')) {
      return 'none';
    }

    // Here we are probably sent an element, but we want to match if they have a
    // parent with an unmask selector.
    const shouldUnmask = (config.unmaskSelector ?? []).some((selector) => element.closest(selector));
    if (shouldUnmask) {
      return 'none';
    }
  }

  return isMaskedForLevel(elementType, getEffectiveMaskLevel(currentUrl, config), element) ? 'level' : 'none';
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
): boolean => getMaskDecision(elementType, config, element, currentUrl) !== 'none';

const redact = (text: string): string => text.replace(/[^\s]/g, '*');

/**
 * Runs a customer-supplied mask callback. Fails closed: a throwing callback or a
 * non-string result falls back to full redaction so a callback bug can never leak text.
 */
const applyCustomMask = (
  customMask: (text: string, element: HTMLElement | null) => string,
  text: string,
  element: HTMLElement | null,
): string => {
  try {
    const result = customMask(text, element);
    return typeof result === 'string' ? result : redact(text);
  } catch {
    return redact(text);
  }
};

export const maskFn =
  (
    elementType: 'text' | 'input',
    config: PrivacyConfig = { defaultMaskLevel: DEFAULT_MASK_LEVEL },
    getCurrentUrl?: () => string,
  ) =>
  (text: string, element: HTMLElement | null): string => {
    const decision = getMaskDecision(elementType, config, element, getCurrentUrl?.());
    if (decision === 'none') {
      return text;
    }
    const customMask = elementType === 'text' ? config.maskTextFn : config.maskInputFn;
    // Explicit masks and password inputs are never delegated to custom callbacks.
    if (decision === 'level' && customMask && !(elementType === 'input' && isPasswordInput(element))) {
      return applyCustomMask(customMask, text, element);
    }
    return redact(text);
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
