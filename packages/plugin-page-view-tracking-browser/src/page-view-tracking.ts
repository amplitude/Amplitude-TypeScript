import { CampaignParser, getGlobalScope } from '@amplitude/analytics-client-common';
import {
  BrowserClient,
  BrowserConfig,
  Event,
  IdentifyOperation,
  IdentifyUserProperties,
  Logger,
  PluginType,
} from '@amplitude/analytics-types';
import { BASE_CAMPAIGN } from '@amplitude/analytics-client-common';
import { CreatePageViewTrackingPlugin, Options } from './typings/page-view-tracking';
import { omitUndefined } from './utils';

export const pageViewTrackingPlugin: CreatePageViewTrackingPlugin = (options: Options = {}) => {
  let amplitude: BrowserClient | undefined;
  const globalScope = getGlobalScope();
  let loggerProvider: Logger | undefined = undefined;

  const createPageViewEvent = async (): Promise<Event> => {
    return {
      event_type: options.eventType ?? '[Amplitude] Page Viewed',
      event_properties: {
        ...(await getCampaignParams()),
        page_domain: /* istanbul ignore next */ (typeof location !== 'undefined' && location.hostname) || '',
        page_location: /* istanbul ignore next */ (typeof location !== 'undefined' && location.href) || '',
        page_path: /* istanbul ignore next */ (typeof location !== 'undefined' && location.pathname) || '',
        page_title: /* istanbul ignore next */ (typeof document !== 'undefined' && document.title) || '',
        page_url: /* istanbul ignore next */ (typeof location !== 'undefined' && location.href.split('?')[0]) || '',
      },
    };
  };

  const shouldTrackOnPageLoad = () =>
    typeof options.trackOn === 'undefined' || (typeof options.trackOn === 'function' && options.trackOn());

  let previousURL: string | null = null;

  const trackHistoryPageView = async (): Promise<void> => {
    const newURL = location.href;

    if (shouldTrackHistoryPageView(options.trackHistoryChanges, newURL, previousURL || '') && shouldTrackOnPageLoad()) {
      /* istanbul ignore next */
      loggerProvider?.log('Tracking page view event');
      amplitude?.track(await createPageViewEvent());
    }
    previousURL = newURL;
  };

  const plugin = {
    name: '@amplitude/plugin-page-view-tracking-browser',
    type: PluginType.ENRICHMENT as const,

    setup: async (config: BrowserConfig, client: BrowserClient) => {
      amplitude = client;

      loggerProvider = config.loggerProvider;
      loggerProvider.log('Installing @amplitude/plugin-page-view-tracking-browser');

      if (options.trackHistoryChanges && globalScope) {
        /* istanbul ignore next */
        globalScope.addEventListener('popstate', () => {
          void trackHistoryPageView();
        });

        /* istanbul ignore next */
        // There is no global browser listener for changes to history, so we have
        // to modify pushState directly.
        // https://stackoverflow.com/a/64927639
        // eslint-disable-next-line @typescript-eslint/unbound-method
        globalScope.history.pushState = new Proxy(globalScope.history.pushState, {
          apply: (target, thisArg, [state, unused, url]) => {
            void trackHistoryPageView();

            return target.apply(thisArg, [state, unused, url]);
          },
        });
      }

      if (shouldTrackOnPageLoad()) {
        loggerProvider.log('Tracking page view event');

        amplitude.track(await createPageViewEvent());
      }
    },

    execute: async (event: Event) => {
      if (options.trackOn === 'attribution' && isCampaignEvent(event)) {
        /* istanbul ignore next */ // loggerProvider should be defined by the time execute is invoked
        loggerProvider?.log('Enriching campaign event to page view event with campaign parameters');
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
