import { getGlobalScope } from './global-scope';

export const getQueryParams = (): Record<string, string | undefined> => {
  const globalScope = getGlobalScope();
  /* istanbul ignore if */
  if (!globalScope?.location?.search) {
    return {};
  }
  const pairs = globalScope.location.search.substring(1).split('&').filter(Boolean);
  const params = pairs.reduce<Record<string, string | undefined>>((acc, curr) => {
    const query = curr.split('=', 2);
    const key = tryDecodeURIComponent(query[0]);
    const value = tryDecodeURIComponent(query[1]);
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
