import { BrowserClient, BrowserConfig, EnrichmentPlugin, Event, Logger } from '@amplitude/analytics-types';
import { getGlobalScope } from '@amplitude/analytics-client-common';
import { BrowserStorage } from '../storage/browser-storage';

export const CURRENT_PAGE_STORAGE_KEY = 'AMP_CURRENT_PAGE';
export const PREVIOUS_PAGE_STORAGE_KEY = 'AMP_PREVIOUS_PAGE';

export const URL_INFO_STORAGE_KEY = 'AMP_URL_INFO';

export type URLInfo = {
  [CURRENT_PAGE_STORAGE_KEY]?: string;
  [PREVIOUS_PAGE_STORAGE_KEY]?: string;
};

enum PreviousPageType {
  Direct = 'direct', // for no prev page or referrer
  Internal = 'internal', // for same domain - this excludes subdomains
  External = 'external', // for different domains
}

export const pageUrlPreviousPagePlugin = (): EnrichmentPlugin => {
  const globalScope = getGlobalScope();
  let sessionStorage: BrowserStorage<URLInfo> | undefined = undefined;
  let isStorageEnabled = false;
  let loggerProvider: Logger | undefined = undefined;

  let isProxied = false;
  let isTracking = false;

  const getDecodeURI = (locationStr: string): string => {
    let decodedLocationStr = locationStr;
    try {
      decodedLocationStr = decodeURI(locationStr);
    } catch (e) {
      /* istanbul ignore next */
      loggerProvider?.error('Malformed URI sequence: ', e);
    }

    return decodedLocationStr;
  };

  const getHostname = (url: string): string | void => {
    try {
      const decodedUrl = getDecodeURI(url);
      return new URL(decodedUrl).hostname;
    } catch (e) {
      /* istanbul ignore next */
      loggerProvider?.error('Could not parse URL: ', e);
    }
  };

  const getPrevPageType = (previousPage: string) => {
    const currentDomain = (typeof location !== 'undefined' && location.hostname) || '';
    const previousPageDomain = previousPage ? getHostname(previousPage) : undefined;

    switch (previousPageDomain) {
      case undefined:
        return PreviousPageType.Direct;
      case currentDomain:
        return PreviousPageType.Internal;
      default:
        return PreviousPageType.External;
    }
  };

  const saveURLInfo = async () => {
    if (sessionStorage && isStorageEnabled) {
      const URLInfo = await sessionStorage.get(URL_INFO_STORAGE_KEY);
      const previousURL = URLInfo?.[CURRENT_PAGE_STORAGE_KEY] || '';
      const currentURL = getDecodeURI((typeof location !== 'undefined' && location.href) || '');

      await sessionStorage.set(URL_INFO_STORAGE_KEY, {
        [CURRENT_PAGE_STORAGE_KEY]: currentURL,
        [PREVIOUS_PAGE_STORAGE_KEY]: previousURL,
      });
    }
  };

  const saveUrlInfoWrapper = () => {
    void saveURLInfo();
  };

  const plugin: EnrichmentPlugin = {
    name: '@amplitude/plugin-page-url-previous-page-browser',
    type: 'enrichment',

    setup: async (config: BrowserConfig, _: BrowserClient) => {
      loggerProvider = config.loggerProvider;
      loggerProvider.log('Installing @amplitude/plugin-page-url-previous-page-browser');

      isTracking = true;

      if (globalScope) {
        sessionStorage = new BrowserStorage<URLInfo>(globalScope.sessionStorage);
        isStorageEnabled = await sessionStorage.isEnabled();

        globalScope.addEventListener('popstate', saveUrlInfoWrapper);

        if (!isProxied) {
          /* istanbul ignore next */
          // There is no global browser listener for changes to history, so we have
          // to modify pushState and replaceState directly.
          // https://stackoverflow.com/a/64927639
          // eslint-disable-next-line @typescript-eslint/unbound-method
          globalScope.history.pushState = new Proxy(globalScope.history.pushState, {
            apply: (target, thisArg, [state, unused, url]) => {
              target.apply(thisArg, [state, unused, url]);
              if (isTracking) {
                saveUrlInfoWrapper();
              }
            },
          });

          // eslint-disable-next-line @typescript-eslint/unbound-method
          globalScope.history.replaceState = new Proxy(globalScope.history.replaceState, {
            apply: (target, thisArg, [state, unused, url]) => {
              target.apply(thisArg, [state, unused, url]);
              if (isTracking) {
                saveUrlInfoWrapper();
              }
            },
          });

          isProxied = true;
        }
      }
    },
    execute: async (event: Event) => {
      const locationHREF = getDecodeURI((typeof location !== 'undefined' && location.href) || '');

      let previousPage = '';
      if (sessionStorage && isStorageEnabled) {
        const URLInfo = await sessionStorage.get(URL_INFO_STORAGE_KEY);
        previousPage = URLInfo?.[PREVIOUS_PAGE_STORAGE_KEY] || document.referrer || '';

        if (!URLInfo?.[CURRENT_PAGE_STORAGE_KEY]) {
          await sessionStorage.set(URL_INFO_STORAGE_KEY, {
            ...(URLInfo || {}),
            [CURRENT_PAGE_STORAGE_KEY]: locationHREF,
            [PREVIOUS_PAGE_STORAGE_KEY]: previousPage,
          });
        }

        event.event_properties = {
          ...(event.event_properties || {}),
          '[Amplitude] Page Domain':
            /* istanbul ignore next */ (typeof location !== 'undefined' && location.hostname) || '',
          '[Amplitude] Page Location': locationHREF,
          '[Amplitude] Page Path':
            /* istanbul ignore next */ (typeof location !== 'undefined' && getDecodeURI(location.pathname)) || '',
          '[Amplitude] Page Title':
            /* istanbul ignore next */ (typeof document !== 'undefined' && document.title) || '',
          '[Amplitude] Page URL': locationHREF.split('?')[0],
          '[Amplitude] Previous Page Location': previousPage,
          '[Amplitude] Previous Page Type': getPrevPageType(previousPage),
        };
      }

      return event;
    },
    teardown: async () => {
      if (globalScope) {
        globalScope.removeEventListener('popstate', saveUrlInfoWrapper);

        isTracking = false;

        if (sessionStorage && isStorageEnabled) {
          await sessionStorage.set(URL_INFO_STORAGE_KEY, {});
        }
      }
    },
  };

  return plugin;
};
