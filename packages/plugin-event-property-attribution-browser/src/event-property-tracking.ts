import {
  AttributionOptions,
  BrowserClient,
  BrowserConfig,
  Campaign,
  CampaignParser,
  EnrichmentPlugin,
  Event,
  getGlobalScope,
  ILogger,
  omitUndefined,
  SpecialEventType,
} from '@amplitude/analytics-core';

const ATTRIBUTION_EVENT_TYPE = '[Amplitude] Attribution';
const EVENT_PROPERTY_EXCLUDED_EVENT_TYPES = new Set<string>([
  SpecialEventType.IDENTIFY,
  SpecialEventType.GROUP_IDENTIFY,
]);

const toEventPropertyCampaign = (campaign: Campaign): Partial<Campaign> => omitUndefined(campaign);

export const eventPropertyTrackingPlugin = (
  options: AttributionOptions = {},
): EnrichmentPlugin<BrowserClient, BrowserConfig> => {
  const fallbackAttributionEvent = options.fallbackAttributionEvent ?? false;
  const globalScope = getGlobalScope();
  let amplitude: BrowserClient | undefined;
  let loggerProvider: ILogger | undefined;
  let eventPropertyCampaign: Partial<Campaign> = {};
  let isTracking = false;
  let isProxied = false;

  const updateCampaignState = async () => {
    const currentCampaign = await new CampaignParser().parse();
    eventPropertyCampaign = toEventPropertyCampaign(currentCampaign);

    if (fallbackAttributionEvent) {
      loggerProvider?.log('Tracking attribution fallback event.');
      amplitude?.track(ATTRIBUTION_EVENT_TYPE, eventPropertyCampaign);
    }
  };

  const onHistoryChange = () => {
    void updateCampaignState();
  };

  return {
    name: '@amplitude/plugin-event-property-attribution-browser',
    type: 'enrichment',

    setup: async (config, client) => {
      amplitude = client;
      loggerProvider = config.loggerProvider;
      isTracking = true;

      loggerProvider.log('Installing event property attribution tracking.');
      await updateCampaignState();

      if (!globalScope) {
        return;
      }

      globalScope.addEventListener('popstate', onHistoryChange);

      if (!isProxied) {
        // There is no global browser listener for history mutations, so proxy both methods.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        globalScope.history.pushState = new Proxy(globalScope.history.pushState, {
          apply: (target, thisArg, [state, unused, url]) => {
            target.apply(thisArg, [state, unused, url]);
            if (isTracking) {
              onHistoryChange();
            }
          },
        });

        // eslint-disable-next-line @typescript-eslint/unbound-method
        globalScope.history.replaceState = new Proxy(globalScope.history.replaceState, {
          apply: (target, thisArg, [state, unused, url]) => {
            target.apply(thisArg, [state, unused, url]);
            if (isTracking) {
              onHistoryChange();
            }
          },
        });

        isProxied = true;
      }
    },

    execute: async (event: Event) => {
      if (EVENT_PROPERTY_EXCLUDED_EVENT_TYPES.has(event.event_type)) {
        return event;
      }

      event.event_properties = {
        ...event.event_properties,
        ...eventPropertyCampaign,
      };

      return event;
    },

    teardown: async () => {
      if (globalScope) {
        globalScope.removeEventListener('popstate', onHistoryChange);
      }

      isTracking = false;
      eventPropertyCampaign = {};
    },
  };
};
