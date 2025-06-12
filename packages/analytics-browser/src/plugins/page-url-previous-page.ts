import { BrowserClient, BrowserConfig, EnrichmentPlugin, Event, Logger } from '@amplitude/analytics-types';
import { getGlobalScope } from '@amplitude/analytics-client-common';

enum PreviousPageType {
  Direct = 'direct', // for no prev page or referrer
  Internal = 'internal', // for same domain - this excludes subdomains
  External = 'external', // for different domains
}

type AdditionalEventProperties = {
  '[Amplitude] Page Domain': string;
  '[Amplitude] Page Location': string;
  '[Amplitude] Page Path': string;
  '[Amplitude] Page Title': string;
  '[Amplitude] Page URL': string;
  '[Amplitude] Previous Page Location': string;
  '[Amplitude] Previous Page Type': PreviousPageType;
};

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

  const getAdditionalEventProperties = (): AdditionalEventProperties | void => {
    const locationHREF = getDecodeURI((typeof location !== 'undefined' && location.href) || '');

    if (globalScope) {
      const sessionStorage = globalScope.sessionStorage;
      if (sessionStorage) {
        const previousPage = sessionStorage.getItem('previousPage') || document.referrer || '';

        // set currentPage if it doesn't exist yet
        if (!sessionStorage.getItem('currentPage')) {
          sessionStorage.setItem('currentPage', locationHREF);
        }

        return {
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
  };

  const trackURLChange = () => {
    const globalScope = getGlobalScope();
    if (globalScope) {
      const sessionStorage = globalScope.sessionStorage;
      if (sessionStorage) {
        const previousURL = sessionStorage.getItem('currentPage') || '';
        const currentURL = getDecodeURI((typeof location !== 'undefined' && location.href) || '');

        sessionStorage.setItem('previousPage', previousURL);
        sessionStorage.setItem('currentPage', currentURL);
      }
    }
  };

  const removeFromSessionStorage = () => {
    const globalScope = getGlobalScope();

    if (globalScope) {
      const sessionStorage = globalScope.sessionStorage;
      if (sessionStorage) {
        sessionStorage.removeItem('previousPage');
        sessionStorage.removeItem('currentPage');
      }
    }
  };

  const plugin: EnrichmentPlugin = {
    name: '@amplitude/plugin-referral-page-url-browser',
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
            console.log('pushState');
            void trackURLChange();
          },
        });
      }
    },
    execute: async (event: Event) => {
      event.event_properties = {
        ...event.event_properties,
        ...getAdditionalEventProperties(),
      };

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
