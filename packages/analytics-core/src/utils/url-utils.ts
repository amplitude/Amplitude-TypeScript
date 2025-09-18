import { ILogger } from '../logger';

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

export const getDecodeURI = (locationStr: string, loggerProvider?: ILogger): string => {
  let decodedLocationStr = locationStr;
  try {
    decodedLocationStr = decodeURI(locationStr);
  } catch (e) {
    /* istanbul ignore next */
    loggerProvider?.error('Malformed URI sequence: ', e);
  }

  return decodedLocationStr;
};
