import {
  getPageTitle,
  replaceSensitiveString,
  BrowserConfig,
  BrowserClient,
  EnrichmentPlugin,
  Event,
  IdentifyOperation,
  IdentifyUserProperties,
  ILogger,
  CampaignParser,
  getGlobalScope,
  BASE_CAMPAIGN,
  BrowserStorage,
  UUID,
} from '@amplitude/analytics-core';
import { CreatePageViewTrackingPlugin, Options } from './typings/page-view-tracking';
import { omitUndefined } from './utils';

export const defaultPageViewEvent = '[Amplitude] Page Viewed';
export const PAGE_VIEW_SESSION_STORAGE_KEY = 'AMP_PAGE_VIEW';

type PageViewSessionStorage = {
  pageViewId: string;
};

export const pageViewTrackingPlugin: CreatePageViewTrackingPlugin = (options: Options = {}) => {
  let amplitude: BrowserClient | undefined;
  const globalScope = getGlobalScope();
  let loggerProvider: ILogger | undefined = undefined;
  let isTracking = false;
  let localConfig: BrowserConfig;
  let sessionStorage: BrowserStorage<PageViewSessionStorage> | undefined;
  const { trackOn, trackHistoryChanges, eventType = defaultPageViewEvent } = options;

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

  const createPageViewEvent = async (pageViewId: string | undefined): Promise<Event> => {
    /* istanbul ignore next */
    const locationHREF = getDecodeURI((typeof location !== 'undefined' && location.href) || '');
    return {
      event_type: eventType,
      event_properties: {
        ...(await getCampaignParams()),
        '[Amplitude] Page Domain':
          /* istanbul ignore next */ (typeof location !== 'undefined' && location.hostname) || '',
        '[Amplitude] Page Location': locationHREF,
        '[Amplitude] Page Path':
          /* istanbul ignore next */ (typeof location !== 'undefined' && getDecodeURI(location.pathname)) || '',
        '[Amplitude] Page Title': /* istanbul ignore next */ getPageTitle(replaceSensitiveString),
        '[Amplitude] Page URL': locationHREF.split('?')[0],
        '[Amplitude] Page View ID': pageViewId,
      },
    };
  };

  const shouldTrackOnPageLoad = () => typeof trackOn === 'undefined' || (typeof trackOn === 'function' && trackOn());

  /* istanbul ignore next */
  let previousURL: string | null = typeof location !== 'undefined' ? location.href : null;

  const trackHistoryPageView = async (): Promise<void> => {
    // Generate new page view id and set it in session storage
    let pageViewId: string | undefined;
    if (sessionStorage) {
      pageViewId = UUID();
      void sessionStorage.set(PAGE_VIEW_SESSION_STORAGE_KEY, { pageViewId });
    }

    const newURL = location.href;
    const shouldTrackPageView =
      shouldTrackHistoryPageView(trackHistoryChanges, newURL, previousURL || '') && shouldTrackOnPageLoad();
    // Note: Update `previousURL` in the same clock tick as `shouldTrackHistoryPageView()`
    // This was previously done after `amplitude?.track(await createPageViewEvent());` and
    // causes a concurrency issue where app triggers `pushState` twice with the same URL target
    // but `previousURL` is only updated after the second `pushState` producing two page viewed events
    previousURL = newURL;

    if (shouldTrackPageView) {
      /* istanbul ignore next */
      loggerProvider?.log('Tracking page view event');
      amplitude?.track(await createPageViewEvent(pageViewId));
    }
  };

  /* istanbul ignore next */
  const handlePageChange = () => {
    void trackHistoryPageView();
  };

  const plugin: EnrichmentPlugin = {
    name: '@amplitude/plugin-page-view-tracking-browser',
    type: 'enrichment',

    setup: async (config: BrowserConfig, client: BrowserClient) => {
      amplitude = client;
      localConfig = config;

      loggerProvider = config.loggerProvider;
      loggerProvider.log('Installing @amplitude/plugin-page-view-tracking-browser');

      isTracking = true;
      if (globalScope) {
        // init session storage
        sessionStorage = new BrowserStorage<PageViewSessionStorage>(globalScope.sessionStorage);

        globalScope.addEventListener('popstate', handlePageChange);

        /* istanbul ignore next */
        // There is no global browser listener for changes to history, so we have
        // to modify pushState directly.
        // https://stackoverflow.com/a/64927639
        // eslint-disable-next-line @typescript-eslint/unbound-method
        globalScope.history.pushState = new Proxy(globalScope.history.pushState, {
          apply: (target, thisArg, [state, unused, url]) => {
            target.apply(thisArg, [state, unused, url]);
            if (isTracking) {
              handlePageChange();
            }
          },
        });
      }

      if (shouldTrackOnPageLoad()) {
        loggerProvider.log('Tracking page view event');
        // Generate new page view id and set it in session storage
        let pageViewId: string | undefined;

        if (sessionStorage) {
          pageViewId = UUID();
          void sessionStorage.set(PAGE_VIEW_SESSION_STORAGE_KEY, { pageViewId });
        }

        amplitude.track(await createPageViewEvent(pageViewId));
      }
    },

    execute: async (event: Event) => {
      if (trackOn === 'attribution' && isCampaignEvent(event)) {
        /* istanbul ignore next */ // loggerProvider should be defined by the time execute is invoked
        loggerProvider?.log('Enriching campaign event to page view event with campaign parameters');
        // Retrieve current page view id from session storage
        let pageViewId: string | undefined;
        if (sessionStorage) {
          const pageViewSession = await sessionStorage.get(PAGE_VIEW_SESSION_STORAGE_KEY);
          pageViewId = pageViewSession?.pageViewId;
        }

        const pageViewEvent = await createPageViewEvent(pageViewId);
        event.event_type = pageViewEvent.event_type;
        event.event_properties = {
          ...event.event_properties,
          ...pageViewEvent.event_properties,
        };
      }

      // Update the pageCounter for the page view event
      if (localConfig && event.event_type === eventType) {
        localConfig.pageCounter = !localConfig.pageCounter ? 1 : localConfig.pageCounter + 1;
        event.event_properties = {
          ...event.event_properties,
          '[Amplitude] Page Counter': localConfig.pageCounter,
        };
      }
      return event;
    },

    teardown: async () => {
      if (globalScope) {
        globalScope.removeEventListener('popstate', handlePageChange);
        isTracking = false;
      }
    },
  };
  return plugin;
};

const getCampaignParams = async () => omitUndefined(await new CampaignParser().parse());

const isCampaignEvent = (event: Event) => {
  if (event.event_type === '$identify' && event.user_properties) {
    const properties = event.user_properties as IdentifyUserProperties;
    const $set = properties[IdentifyOperation.SET] || {};
    const $unset = properties[IdentifyOperation.UNSET] || {};
    const userProperties = [...Object.keys($set), ...Object.keys($unset)];
    return Object.keys(BASE_CAMPAIGN).every((value) => userProperties.includes(value));
  }
  return false;
};

export const shouldTrackHistoryPageView = (
  trackingOption: Options['trackHistoryChanges'],
  newURLStr: string,
  oldURLStr: string,
): boolean => {
  switch (trackingOption) {
    case 'pathOnly': {
      if (oldURLStr == '') return true;
      const newURL = new URL(newURLStr);
      const oldURL = new URL(oldURLStr);
      const newBaseStr = newURL.origin + newURL.pathname;
      const oldBaseStr = oldURL.origin + oldURL.pathname;
      return newBaseStr !== oldBaseStr;
    }
    default:
      return newURLStr !== oldURLStr;
  }
};
