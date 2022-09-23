import { CampaignParser } from '@amplitude/analytics-client-common';
import {
  BaseEvent,
  BrowserClient,
  BrowserConfig,
  EnrichmentPlugin,
  Event,
  IdentifyOperation,
  IdentifyUserProperties,
  Logger,
  PluginType,
} from '@amplitude/analytics-types';
import { BASE_CAMPAIGN } from '@amplitude/analytics-client-common';
import { Options } from './typings/page-view-tracking';
import { omitUndefined } from './utils';

export const pageViewTrackingPlugin = (client: BrowserClient, options: Options = {}): EnrichmentPlugin => {
  let loggerProvider: Logger | undefined = undefined;

  return {
    name: 'page-view-tracking',
    type: PluginType.ENRICHMENT,

    setup: async (config: BrowserConfig) => {
      loggerProvider = config.loggerProvider;
      loggerProvider.log('Installing @amplitude/plugin-page-view-tracking-browser');

      options.trackOn = config.attribution?.trackPageViews ? 'attribution' : options.trackOn;

      // Turn off sending page view event by "runAttributionStrategy" function
      if (config.attribution?.trackPageViews) {
        loggerProvider.warn(
          '@amplitude/plugin-page-view-tracking-browser overrides page view tracking behavior defined in @amplitude/analytics-browser',
        );
        config.attribution.trackPageViews = false;
      }

      if (typeof options.trackOn === 'undefined' || (typeof options.trackOn === 'function' && options.trackOn())) {
        const event = createPageViewEvent();
        event.event_properties = {
          ...(await getCampaignParams()),
          ...event.event_properties,
        };
        loggerProvider.log('Tracking page view event');
        client.track(event);
      }
    },

    execute: async (event: Event) => {
      if (options.trackOn === 'attribution' && isCampaignEvent(event)) {
        /* istanbul ignore next */ // loggerProvider should be defined by the time execute is invoked
        loggerProvider?.log('Enriching campaign event to page view event with campaign parameters');
        const pageViewEvent = createPageViewEvent();
        event.event_type = pageViewEvent.event_type;
        event.event_properties = {
          ...(await getCampaignParams()),
          ...event.event_properties,
          ...pageViewEvent.event_properties,
        };
      }
      return event;
    },
  };
};

const getCampaignParams = async () => omitUndefined(await new CampaignParser().parse());

const createPageViewEvent = (): Event => {
  const pageViewEvent: BaseEvent = {
    event_type: 'Page View',
    event_properties: {
      page_domain: /* istanbul ignore next */ (typeof location !== 'undefined' && location.hostname) || '',
      page_location: /* istanbul ignore next */ (typeof location !== 'undefined' && location.href) || '',
      page_path: /* istanbul ignore next */ (typeof location !== 'undefined' && location.pathname) || '',
      page_title: /* istanbul ignore next */ (typeof document !== 'undefined' && document.title) || '',
      page_url: /* istanbul ignore next */ (typeof location !== 'undefined' && location.href.split('?')[0]) || '',
    },
  };
  return pageViewEvent;
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
