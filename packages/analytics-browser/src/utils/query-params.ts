export const getQueryParams = (): Record<string, string> => {
  /* istanbul ignore if */
  if (typeof window === 'undefined') {
    return {};
  }
  const pairs = window.location.search.substring(1).split('&').filter(Boolean);
  const params = pairs.reduce<Record<string, string>>((acc, curr) => {
    const [key, value = ''] = curr.split('=', 2);
    acc[decodeURIComponent(key)] = decodeURIComponent(value);
    return acc;
  }, {});
  return params;
};
