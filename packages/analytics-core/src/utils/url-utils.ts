/**
 * Checks if a given URL matches any pattern in an allowlist of URLs or regex patterns.
 * @param url - The URL to check
 * @param allowlist - Array of allowed URLs (strings) or regex patterns
 * @returns true if the URL matches any pattern in the allowlist, false otherwise
 */
export const isUrlMatchAllowlist = (url: string, allowlist: (string | RegExp)[] | undefined): boolean => {
  if (!allowlist || !allowlist.length) {
    return true;
  }
  return allowlist.some((allowedUrl) => {
    if (typeof allowedUrl === 'string') {
      return url === allowedUrl;
    }
    return url.match(allowedUrl);
  });
};

/**
 * Checks if a given URL matches any pattern in an excludelist of URLs or regex patterns.
 * @param url - The URL to check
 * @param excludelist - Array of excluded URLs (strings) or regex patterns
 * @returns true if the URL matches any pattern in the excludelist, false otherwise
 */
export const isUrlMatchExcludelist = (url: string, excludelist: (string | RegExp)[] | undefined): boolean => {
  if (!excludelist || !excludelist.length) {
    return false;
  }
  return excludelist.some((excludedUrl) => {
    if (typeof excludedUrl === 'string') {
      return url === excludedUrl;
    }
    return url.match(excludedUrl);
  });
};
