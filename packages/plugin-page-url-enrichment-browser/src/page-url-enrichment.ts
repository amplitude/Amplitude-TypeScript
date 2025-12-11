import {
  type BrowserClient,
  type BrowserConfig,
  BrowserStorage,
  type EnrichmentPlugin,
  type Event,
  getDecodeURI,
  getGlobalScope,
  getPageTitle,
  type ILogger,
  PageUrlEnrichmentOptions,
  replaceSensitiveString,
  SpecialEventType,
} from '@amplitude/analytics-core';

export const CURRENT_PAGE_STORAGE_KEY = 'AMP_CURRENT_PAGE';
export const PREVIOUS_PAGE_STORAGE_KEY = 'AMP_PREVIOUS_PAGE';
export const URL_INFO_STORAGE_KEY = 'AMP_URL_INFO';

export type URLInfo = {
  [CURRENT_PAGE_STORAGE_KEY]?: string;
  [PREVIOUS_PAGE_STORAGE_KEY]?: string;
};

enum PreviousPageType {
  Direct = 'direct', // for no prev page or referrer
  Internal = 'internal', // for internal domains - exact domain matches or when current and previous page are both internal domains
  External = 'external', // for different domains
}

export const EXCLUDED_DEFAULT_EVENT_TYPES = new Set<string>([
  SpecialEventType.IDENTIFY,
  SpecialEventType.GROUP_IDENTIFY,
  SpecialEventType.REVENUE,
]);

export const isPageUrlEnrichmentEnabled = (option: unknown): boolean => {
  if (typeof option === 'boolean') {
    return option;
  }
  if (typeof option === 'object' && option !== null && 'pageUrlEnrichment' in option) {
    return Boolean((option as { pageUrlEnrichment?: boolean }).pageUrlEnrichment);
  }
  return false;
};

export const pageUrlEnrichmentPlugin = ({ internalDomains = [] }: PageUrlEnrichmentOptions = {}): EnrichmentPlugin => {
  const globalScope = getGlobalScope();
  let sessionStorage: BrowserStorage<URLInfo> | undefined = undefined;
  let isStorageEnabled = false;
  let loggerProvider: ILogger | undefined = undefined;

  let isProxied = false;
  let isTracking = false;

  const getHostname = (url: string): string | undefined => {
    let hostname: string | undefined;

    try {
      const decodedUrl = getDecodeURI(url, loggerProvider);
      hostname = new URL(decodedUrl).hostname;
    } catch (e) {
      /* istanbul ignore next */
      loggerProvider?.error('Could not parse URL: ', e);
    }

    return hostname;
  };

  const getPrevPageType = (previousPage: string) => {
    const currentDomain = (typeof location !== 'undefined' && location.hostname) || '';
    const previousPageDomain = previousPage ? getHostname(previousPage) : undefined;

    if (!previousPageDomain) {
      return PreviousPageType.Direct;
    }

    const isCurrentInternal = internalDomains.some((domain) => currentDomain.indexOf(domain) !== -1);
    const isPrevInternal = internalDomains.some((domain) => previousPageDomain.indexOf(domain) !== -1);

    if (currentDomain === previousPageDomain || (isPrevInternal && isCurrentInternal)) {
      return PreviousPageType.Internal;
    }

    return PreviousPageType.External;
  };

  const saveURLInfo = async () => {
    if (sessionStorage && isStorageEnabled) {
      const URLInfo = await sessionStorage.get(URL_INFO_STORAGE_KEY);
      const currentURL = getDecodeURI((typeof location !== 'undefined' && location.href) || '');
      const storedCurrentURL = URLInfo?.[CURRENT_PAGE_STORAGE_KEY] || '';

      let previousURL: string | undefined;
      if (currentURL === storedCurrentURL) {
        previousURL = URLInfo?.[PREVIOUS_PAGE_STORAGE_KEY] || '';
      } else if (storedCurrentURL) {
        previousURL = storedCurrentURL;
      } else {
        previousURL = document.referrer || '';
      }

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
    name: '@amplitude/plugin-page-url-enrichment-browser',
    type: 'enrichment',

    setup: async (config: BrowserConfig, _: BrowserClient) => {
      loggerProvider = config.loggerProvider;
      loggerProvider.log('Installing @amplitude/plugin-page-url-enrichment-browser');

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

      if (sessionStorage && isStorageEnabled) {
        const URLInfo = await sessionStorage.get(URL_INFO_STORAGE_KEY);
        if (!URLInfo?.[CURRENT_PAGE_STORAGE_KEY]) {
          await sessionStorage.set(URL_INFO_STORAGE_KEY, {
            [CURRENT_PAGE_STORAGE_KEY]: locationHREF,
            [PREVIOUS_PAGE_STORAGE_KEY]: document.referrer || '',
          });
        }

        const updatedURLInfo = await sessionStorage.get(URL_INFO_STORAGE_KEY);
        let previousPage = '';
        if (updatedURLInfo) {
          previousPage = updatedURLInfo[PREVIOUS_PAGE_STORAGE_KEY] || '';
        }

        // no need to proceed to add additional properties if the event is one of the default event types to be excluded
        if (EXCLUDED_DEFAULT_EVENT_TYPES.has(event.event_type)) {
          return event;
        }

        event.event_properties = {
          ...(event.event_properties || {}),
          '[Amplitude] Page Domain': addIfNotExist(
            event,
            '[Amplitude] Page Domain',
            (typeof location !== 'undefined' && location.hostname) || '',
          ),
          '[Amplitude] Page Location': addIfNotExist(event, '[Amplitude] Page Location', locationHREF),
          '[Amplitude] Page Path': addIfNotExist(
            event,
            '[Amplitude] Page Path',
            (typeof location !== 'undefined' && getDecodeURI(location.pathname)) || '',
          ),
          '[Amplitude] Page Title': addIfNotExist(
            event,
            '[Amplitude] Page Title',
            getPageTitle(replaceSensitiveString),
          ),
          '[Amplitude] Page URL': addIfNotExist(event, '[Amplitude] Page URL', locationHREF.split('?')[0]),
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
      }

      if (sessionStorage && isStorageEnabled) {
        await sessionStorage.set(URL_INFO_STORAGE_KEY, {});
      }
    },
  };

  return plugin;
};

function addIfNotExist(event: Event, key: string, value: string): string {
  if (!event.event_properties) {
    event.event_properties = {};
  }

  if ((event.event_properties as { [key: string]: any })[key] === undefined) {
    return value;
  }

  return (event.event_properties as { [key: string]: any })[key] as string;
}
