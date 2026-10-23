import { getGlobalScope } from '../global-scope';

function parseNetworkRequestUrlFromString(href: string) {
  const hashIndex = href.indexOf('#');
  const fragment = hashIndex >= 0 ? href.slice(hashIndex + 1) : '';
  const urlWithoutHash = hashIndex >= 0 ? href.slice(0, hashIndex) : href;

  const queryIndex = urlWithoutHash.indexOf('?');
  const query = queryIndex >= 0 ? urlWithoutHash.slice(queryIndex + 1) : '';
  const hrefWithoutQueryOrHash = queryIndex >= 0 ? urlWithoutHash.slice(0, queryIndex) : urlWithoutHash;

  const authorityMatch = hrefWithoutQueryOrHash.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i);
  const host = authorityMatch?.[1] ?? '';

  return { query, fragment, href, hrefWithoutQueryOrHash, host };
}

/** @internal Shared URL parsing extracted without changing existing capture behavior. */
export function parseNetworkRequestUrl(url: string | undefined) {
  if (!url) {
    return;
  }
  try {
    /* istanbul ignore next */
    const currentHref = getGlobalScope()?.location.href;
    const urlObj = new URL(url, currentHref);
    const query = urlObj.searchParams.toString();
    const fragment = urlObj.hash.replace('#', '');
    const href = urlObj.href;
    const host = urlObj.host;
    urlObj.hash = '';
    urlObj.search = '';
    const hrefWithoutQueryOrHash = urlObj.href;
    return { query, fragment, href, hrefWithoutQueryOrHash, host };
  } catch {
    try {
      // if global URL is not available, parse the URL from the string
      return parseNetworkRequestUrlFromString(url);
    } catch {
      /* istanbul ignore next */
      return;
    }
  }
}
