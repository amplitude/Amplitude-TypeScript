import { MaskLevel, PrivacyConfig } from './types';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');

const isLevel = (value: unknown): value is MaskLevel =>
  value === 'light' || value === 'medium' || value === 'conservative';

/** Returns a copy. The caller supplies a validator for the target DOM's CSS syntax. */
export const validatePrivacySelectors = (
  config: PrivacyConfig,
  validate: (selector: string) => void,
  onInvalid?: (selector: string) => void,
): PrivacyConfig => {
  const result = { ...config };
  for (const key of ['blockSelector', 'maskSelector', 'unmaskSelector'] as const) {
    const value = config[key];
    const selectors = typeof value === 'string' ? [value] : value ?? [];
    const valid = selectors.filter((selector) => {
      try {
        validate(selector);
        return true;
      } catch {
        if (!onInvalid) throw new Error(`Invalid privacy selector: ${selector}`);
        onInvalid(selector);
        return false;
      }
    });
    result[key] = valid.length ? valid : undefined;
  }
  return result;
};

/** Strict remote-policy boundary. Invalid policy throws; callers must not start capture on failure. */
export const parsePrivacyConfig = (value: unknown, validateSelector: (selector: string) => void): PrivacyConfig => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid privacy config');
  const input = value as Record<string, unknown>;
  const config: PrivacyConfig = {};
  if (input.defaultMaskLevel !== undefined) {
    if (!isLevel(input.defaultMaskLevel)) throw new Error('Invalid defaultMaskLevel');
    config.defaultMaskLevel = input.defaultMaskLevel;
  }
  for (const key of ['blockSelector', 'maskSelector', 'unmaskSelector', 'maskAttributes'] as const) {
    const entry = input[key];
    if (entry === undefined) continue;
    if (key === 'blockSelector' && typeof entry === 'string') {
      config[key] = entry;
      continue;
    }
    if (!isStringArray(entry)) throw new Error(`Invalid ${key}`);
    config[key] = [...entry];
  }
  if (input.urlMaskLevels !== undefined) {
    if (!Array.isArray(input.urlMaskLevels)) throw new Error('Invalid urlMaskLevels');
    config.urlMaskLevels = input.urlMaskLevels.map((rule: unknown) => {
      if (!rule || typeof rule !== 'object') throw new Error('Invalid URL mask rule');
      const entry = rule as Record<string, unknown>;
      if (typeof entry.match !== 'string' || !entry.match.trim() || !isLevel(entry.maskLevel)) {
        throw new Error('Invalid URL mask rule');
      }
      return { match: entry.match, maskLevel: entry.maskLevel };
    });
  }
  return validatePrivacySelectors(config, validateSelector);
};
