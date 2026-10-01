import { PrivacyConfig } from './types';
import { getEffectiveMaskLevel, maskFn, maskAttributeFn } from './policy';

export const getBlockSelectors = (config?: PrivacyConfig): string => {
  const configured = config?.blockSelector;
  const selectors = typeof configured === 'string' ? (configured ? [configured] : []) : configured ?? [];
  return [...selectors, '[data-amp-block]'].join(',');
};

export const getMaskTextSelectors = (config?: PrivacyConfig, url?: string): string => {
  // rrweb selects which text reaches the callback at recorder startup. Include all
  // text if any route can require conservative masking; callbacks resolve the URL dynamically.
  if (
    config &&
    (getEffectiveMaskLevel(url, config) === 'conservative' ||
      config.defaultMaskLevel === 'conservative' ||
      config.urlMaskLevels?.some((rule) => rule.maskLevel === 'conservative'))
  )
    return '*';
  return [...(config?.maskSelector ?? []), '[data-amp-mask]'].join(',');
};

/** Lifecycle and URL observation belong to the caller. Replace the recorder when policy changes. */
export const createPrivacyRecorderOptions = (config?: PrivacyConfig, getCurrentUrl: () => string = () => '') => {
  const blockSelector = getBlockSelectors(config);
  return {
    maskAllInputs: true,
    maskTextClass: 'amp-mask',
    blockClass: 'amp-block',
    blockSelector,
    maskTextSelector: getMaskTextSelectors(config, getCurrentUrl()),
    maskInputFn: maskFn('input', config, getCurrentUrl),
    maskTextFn: maskFn('text', config, getCurrentUrl),
    maskAttributeFn: maskAttributeFn(config, getCurrentUrl),
  };
};
