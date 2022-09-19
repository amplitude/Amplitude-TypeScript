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

  return {
    name: 'page-view-tracking',
    type: PluginType.ENRICHMENT,

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

      if (
        typeof pageTrackingConfig.trackOn === 'undefined' ||
        (typeof pageTrackingConfig.trackOn === 'function' && pageTrackingConfig.trackOn())
      ) {
        const event = createPageViewEvent();
        event.event_properties = {
          ...(await getCampaignParamsForPageViewEvent()),
          ...event.event_properties,
        };
        instance.track(event);
      }
    },

    execute: async (event: Event) => {
      if (pageTrackingConfig.trackOn === 'attribution' && isCampaignEvent(event)) {
        const pageViewEvent = createPageViewEvent();
        event.event_type = pageViewEvent.event_type;
        event.event_properties = {
          ...(await getCampaignParamsForPageViewEvent()),
          ...event.event_properties,
          ...pageViewEvent.event_properties,
        };
      }
      return event;
    },
  };
};

const createPageViewEvent = (): Event => {
  const pageViewEvent: BaseEvent = {
    event_type: 'Page View',
    event_properties: {
      page_domain: location.hostname,
      page_location: /* istanbul ignore next */ (typeof location !== 'undefined' && location.href) || '',
      page_path: /* istanbul ignore next */ (typeof location !== 'undefined' && location.pathname) || '',
      page_title: /* istanbul ignore next */ (typeof document !== 'undefined' && document.title) || '',
      page_url: location.href.split('?')[0],
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
