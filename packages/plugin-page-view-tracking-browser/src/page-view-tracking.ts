import { CampaignParser } from '@amplitude/analytics-client-common';
import {
  BaseEvent,
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  Event,
  IdentifyOperation,
  IdentifyUserProperties,
  PluginType,
} from '@amplitude/analytics-types';
import { BASE_CAMPAIGN } from './constant';
import { PageTrackingBrowserOptions } from './typings/page-view-tracking';

export const pageViewTrackingPlugin = (
  instance: BrowserClient,
  options: PageTrackingBrowserOptions = {},
): EnrichmentPlugin => {
  let pageTrackingConfig = options;

  const campaignParser = new CampaignParser();

  const getCampaignParamsForPageViewEvent = async () => {
    const parsed = await campaignParser.parse();
    const campaignParams: Record<string, string> = {};
    for (const key in parsed) {
      const val = parsed[key];
      if (val) {
        campaignParams[key] = val;
      }
    }
    return campaignParams;
  };

  const shouldTrackOnPageLoad = () =>
    typeof pageTrackingConfig.trackOn === 'undefined' ||
    (typeof pageTrackingConfig.trackOn === 'function' && pageTrackingConfig.trackOn());

  const createPageViewEvent = async (): Promise<Event> => {
    const pageViewEvent: BaseEvent = {
      event_type: 'Page View',
      event_properties: {
        ...(await getCampaignParamsForPageViewEvent()),
        page_domain: /* istanbul ignore next */ (typeof location !== 'undefined' && location.hostname) || '',
        page_location: /* istanbul ignore next */ (typeof location !== 'undefined' && location.href) || '',
        page_path: /* istanbul ignore next */ (typeof location !== 'undefined' && location.pathname) || '',
        page_title: /* istanbul ignore next */ (typeof document !== 'undefined' && document.title) || '',
        page_url: /* istanbul ignore next */ (typeof location !== 'undefined' && location.href.split('?')[0]) || '',
      },
    };
    return pageViewEvent;
  };

  let previousURL: string | null = null;

  const trackHistoryPageView = async (): Promise<void> => {
    const newURL = location.href;

    if (
      shouldTrackHistoryPageView(pageTrackingConfig.trackHistoryChanges, newURL, previousURL || '') &&
      shouldTrackOnPageLoad()
    ) {
      instance.track(await createPageViewEvent());
    }
    previousURL = newURL;
  };

  const plugin = {
    name: 'page-view-tracking',
    type: PluginType.ENRICHMENT as const,

    setup: async (config: BrowserConfig) => {
      const attributionConfig = config.attribution;
      pageTrackingConfig = {
        trackOn: attributionConfig?.trackPageViews ? 'attribution' : undefined,
        ...pageTrackingConfig,
      };

      // Turn off sending page view event by "runAttributionStrategy" function
      if (attributionConfig) {
        attributionConfig.trackPageViews = false;
      }

      if (shouldTrackOnPageLoad()) {
        instance.track(await createPageViewEvent());
      }

      /* istanbul ignore next */
      if (pageTrackingConfig.trackHistoryChanges) {
        window.addEventListener('popstate', () => {
          void trackHistoryPageView();
        });

        // There is no global browser listener for changes to history, so we have
        // to modify pushState directly.
        // https://stackoverflow.com/a/64927639
        // eslint-disable-next-line @typescript-eslint/unbound-method
        window.history.pushState = new Proxy(window.history.pushState, {
          apply: (target, thisArg, [state, unused, url]) => {
            void trackHistoryPageView();

            return target.apply(thisArg, [state, unused, url]);
          },
        });
      }
    },

    execute: async (event: Event) => {
      if (pageTrackingConfig.trackOn === 'attribution' && isCampaignEvent(event)) {
        const pageViewEvent = await createPageViewEvent();
        event.event_type = pageViewEvent.event_type;
        event.event_properties = {
          ...event.event_properties,
          ...pageViewEvent.event_properties,
        };
      }
      return event;
    },
  };

  // Required for unit tests
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  (plugin as any).__trackHistoryPageView = trackHistoryPageView;

  return plugin;
};

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
  trackingOption: PageTrackingBrowserOptions['trackHistoryChanges'],
  newURL: string,
  oldURL: string,
): boolean => {
  switch (trackingOption) {
    case 'pathOnly':
      return newURL.split('?')[0] !== oldURL.split('?')[0];
    default:
      return newURL !== oldURL;
  }
};
