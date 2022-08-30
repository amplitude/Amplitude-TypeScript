export const getQueryParams = (): Record<string, string | undefined> => {
  /* istanbul ignore if */
  if (typeof window === 'undefined' || !window.location || !window.location.search) {
    return {};
  }
  const pairs = window.location.search.substring(1).split('&').filter(Boolean);
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
