import { getGlobalScope } from './global-scope';

export const getQueryParams = (): Record<string, string | undefined> => {
  const globalScope = getGlobalScope();
  /* istanbul ignore if */
  if (!globalScope?.location?.search) {
    return {};
  }
  const pairs = globalScope.location.search.substring(1).split('&').filter(Boolean);
  const params = pairs.reduce<Record<string, string | undefined>>((acc, curr) => {
    const separatorIndex = curr.indexOf('=');
    if (separatorIndex === -1) {
      return acc;
    }
    // Form query parsing replaces raw '+' before decoding so '%2B' remains a literal '+'.
    const key = tryDecodeURIComponent(curr.slice(0, separatorIndex).replace(/\+/g, ' '));
    const value = tryDecodeURIComponent(curr.slice(separatorIndex + 1).replace(/\+/g, ' '));
    if (!value) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});
  return params;
};

export const tryDecodeURIComponent = (value = '') => {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
};
