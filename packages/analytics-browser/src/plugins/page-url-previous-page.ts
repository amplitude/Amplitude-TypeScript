import { BrowserClient, BrowserConfig, EnrichmentPlugin, Event, Logger } from '@amplitude/analytics-types';
import { getGlobalScope } from '@amplitude/analytics-client-common';

enum PreviousPageType {
  Direct = 'direct', // for no prev page or referrer
  Internal = 'internal', // for same domain - this excludes subdomains
  External = 'external', // for different domains
}

export const pageUrlPreviousPagePlugin = (): EnrichmentPlugin => {
  const globalScope = getGlobalScope();
  let loggerProvider: Logger | undefined = undefined;
  let pushState: undefined | ((data: any, unused: string, url?: string | URL | null) => void);

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

  const getPrevPageType = (previousPage: string) => {
    const currentDomain = getDecodeURI((typeof location !== 'undefined' && location.hostname) || '');
    const previousPageDomain = previousPage ? new URL(previousPage).hostname : undefined;

    switch (previousPageDomain) {
      case undefined:
        return PreviousPageType.Direct;
      case currentDomain:
        return PreviousPageType.Internal;
      default:
        return PreviousPageType.External;
    }
  };

  const trackURLChange = () => {
    const globalScope = getGlobalScope();
    if (globalScope) {
      const sessionStorage = globalScope.sessionStorage;
      if (sessionStorage) {
        const previousURL = getFromStorage(sessionStorage, 'currentPage', loggerProvider) || '';
        const currentURL = getDecodeURI((typeof location !== 'undefined' && location.href) || '');

        setInStorage(sessionStorage, 'previousPage', previousURL, loggerProvider);
        setInStorage(sessionStorage, 'currentPage', currentURL, loggerProvider);
      }
    }
  };

  const removeFromSessionStorage = () => {
    const globalScope = getGlobalScope();
    if (globalScope) {
      const sessionStorage = globalScope.sessionStorage;
      if (sessionStorage) {
        removeFromStorage(sessionStorage, 'previousPage', loggerProvider);
        removeFromStorage(sessionStorage, 'currentPage', loggerProvider);
      }
    }
  };

  const plugin: EnrichmentPlugin = {
    name: '@amplitude/plugin-page-url-previous-page-browser',
    type: 'enrichment',

    setup: async (config: BrowserConfig, _: BrowserClient) => {
      loggerProvider = config.loggerProvider;
      loggerProvider.log('Installing @amplitude/plugin-previous-page-page-url-browser');

      if (globalScope) {
        globalScope.addEventListener('popstate', trackURLChange);

        // Save reference to original push state, to be used in teardown
        // eslint-disable-next-line @typescript-eslint/unbound-method
        pushState = globalScope.history.pushState;

        /* istanbul ignore next */
        // There is no global browser listener for changes to history, so we have
        // to modify pushState directly.
        // https://stackoverflow.com/a/64927639
        // eslint-disable-next-line @typescript-eslint/unbound-method
        globalScope.history.pushState = new Proxy(globalScope.history.pushState, {
          apply: (target, thisArg, [state, unused, url]) => {
            target.apply(thisArg, [state, unused, url]);
            void trackURLChange();
          },
        });
      }
    },
    execute: async (event: Event) => {
      const locationHREF = getDecodeURI((typeof location !== 'undefined' && location.href) || '');

      if (globalScope) {
        const sessionStorage = globalScope.sessionStorage;
        let previousPage = '';

        if (sessionStorage) {
          previousPage = getFromStorage(sessionStorage, 'previousPage', loggerProvider) || document.referrer || '';

          if (!getFromStorage(sessionStorage, 'currentPage', loggerProvider)) {
            setInStorage(sessionStorage, 'currentPage', locationHREF, loggerProvider);
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
      }

      return event;
    },
    teardown: async () => {
      if (globalScope) {
        globalScope.removeEventListener('popstate', trackURLChange);
        if (pushState) {
          globalScope.history.pushState = pushState;
        }
        removeFromSessionStorage();
      }
    },
  };

  return plugin;
};

export const setInStorage = (storage: Storage, key: string, value: string, loggerProvider?: Logger) => {
  try {
    storage.setItem(key, value);
  } catch (e) {
    loggerProvider?.error('Could not set into storage:', e);
  }
};

export const getFromStorage = (storage: Storage, key: string, loggerProvider?: Logger) => {
  let value = null;
  try {
    value = storage.getItem(key);
  } catch (e) {
    loggerProvider?.error('Could not get from storage:', e);
  }

  return value;
};

export const removeFromStorage = (storage: Storage, key: string, loggerProvider?: Logger) => {
  try {
    storage.removeItem(key);
  } catch (e) {
    loggerProvider?.error('Could not remove from storage:', e);
  }
};
