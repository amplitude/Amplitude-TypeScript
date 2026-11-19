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
    const key = tryDecodeURIComponent(separatorIndex === -1 ? curr : curr.slice(0, separatorIndex));
    const value = tryDecodeURIComponent(separatorIndex === -1 ? undefined : curr.slice(separatorIndex + 1), true);
    if (!value) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});
  return params;
};

export const tryDecodeURIComponent = (value = '', decodePlusAsSpace = false) => {
  try {
    return decodeURIComponent(decodePlusAsSpace ? value.replace(/\+/g, ' ') : value);
  } catch {
    return '';
  }
};
