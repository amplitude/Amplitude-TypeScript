import { isNative } from './platform';

export const getQueryParams = (): Record<string, string | undefined> => {
  /* istanbul ignore if */
  if (isNative() || typeof window === 'undefined') {
    return {};
  }
  const pairs = window.location.search.substring(1).split('&').filter(Boolean);
  const params = pairs.reduce<Record<string, string | undefined>>((acc, curr) => {
    const [key, value = ''] = curr.split('=', 2);
    if (!value) {
      return acc;
    }
    acc[decodeURIComponent(key)] = decodeURIComponent(value);
    return acc;
  }, {});
  return params;
};
