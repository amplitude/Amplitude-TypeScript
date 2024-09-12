import { CampaignParser, getGlobalScope } from '@amplitude/analytics-client-common';
import {
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  Event,
  IdentifyOperation,
  IdentifyUserProperties,
  Logger,
} from '@amplitude/analytics-types';
import { BASE_CAMPAIGN } from '@amplitude/analytics-client-common';
import { CreatePageViewTrackingPlugin, Options } from './typings/page-view-tracking';
import { omitUndefined } from './utils';

export const defaultPageViewEvent = '[Amplitude] Page Viewed';

export const pageViewTrackingPlugin: CreatePageViewTrackingPlugin = (options: Options = {}) => {
  let amplitude: BrowserClient | undefined;
  const globalScope = getGlobalScope();
  let loggerProvider: Logger | undefined = undefined;
  let pushState: undefined | ((data: any, unused: string, url?: string | URL | null) => void);
  let localConfig: BrowserConfig;
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

  const createPageViewEvent = async (): Promise<Event> => {
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
        '[Amplitude] Page Title': /* istanbul ignore next */ (typeof document !== 'undefined' && document.title) || '',
        '[Amplitude] Page URL': locationHREF.split('?')[0],
      },
    };
  };

  const shouldTrackOnPageLoad = () => typeof trackOn === 'undefined' || (typeof trackOn === 'function' && trackOn());

  /* istanbul ignore next */
  let previousURL: string | null = typeof location !== 'undefined' ? location.href : null;

  const trackHistoryPageView = async (): Promise<void> => {
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
      amplitude?.track(await createPageViewEvent());
    }
  };

  /* istanbul ignore next */
  const trackHistoryPageViewWrapper = () => {
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

      if (globalScope) {
        globalScope.addEventListener('popstate', trackHistoryPageViewWrapper);

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
            void trackHistoryPageView();
          },
        });
      }

      if (shouldTrackOnPageLoad()) {
        loggerProvider.log('Tracking page view event');

        amplitude.track(await createPageViewEvent());
      }
    },

    execute: async (event: Event) => {
      if (trackOn === 'attribution' && isCampaignEvent(event)) {
        /* istanbul ignore next */ // loggerProvider should be defined by the time execute is invoked
        loggerProvider?.log('Enriching campaign event to page view event with campaign parameters');
        const pageViewEvent = await createPageViewEvent();
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
        globalScope.removeEventListener('popstate', trackHistoryPageViewWrapper);
        if (pushState) {
          globalScope.history.pushState = pushState;
        }
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
