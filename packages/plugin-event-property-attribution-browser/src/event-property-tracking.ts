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

type HistoryStateMethod = History['pushState'];

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
  let originalPushState: History['pushState'] | undefined;
  let originalReplaceState: History['replaceState'] | undefined;
  let installedPushState: History['pushState'] | undefined;
  let installedReplaceState: History['replaceState'] | undefined;

  const updateCampaignState = async () => {
    const currentCampaign = await new CampaignParser().parse();
    eventPropertyCampaign = toEventPropertyCampaign(currentCampaign);

    if (fallbackAttributionEvent) {
      /* istanbul ignore next */
      loggerProvider?.log('Tracking attribution fallback event.');
      /* istanbul ignore next */
      amplitude?.track(ATTRIBUTION_EVENT_TYPE, eventPropertyCampaign);
    }
  };

  const onHistoryChange = () => {
    // CampaignParser.parse() is async by type, but its current implementation computes synchronously.
    // In the Browser SDK, this history-triggered refresh starts immediately and reaches its continuation
    // before Timeline.scheduleApply(0) runs event enrichment, so pushState()/replaceState() followed by
    // track() in the same tick does not currently race. Revisit this assumption if campaign parsing or
    // timeline scheduling becomes truly async in the future.
    void updateCampaignState();
  };

  const createHistoryStateProxy = (method: HistoryStateMethod): HistoryStateMethod =>
    new Proxy(method, {
      apply: (target, thisArg, args: Parameters<HistoryStateMethod>) => {
        Reflect.apply(target, thisArg, args);
        if (isTracking) {
          onHistoryChange();
        }
      },
    });

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
        originalPushState = Reflect.get(globalScope.history, 'pushState') as History['pushState'] | undefined;
        originalReplaceState = Reflect.get(globalScope.history, 'replaceState') as History['replaceState'] | undefined;

        /* istanbul ignore next */
        if (!originalPushState || !originalReplaceState) {
          return;
        }

        installedPushState = createHistoryStateProxy(originalPushState);
        globalScope.history.pushState = installedPushState;

        installedReplaceState = createHistoryStateProxy(originalReplaceState);
        globalScope.history.replaceState = installedReplaceState;

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

        const currentPushState = Reflect.get(globalScope.history, 'pushState') as History['pushState'] | undefined;
        const currentReplaceState = Reflect.get(globalScope.history, 'replaceState') as
          | History['replaceState']
          | undefined;

        if (isProxied && currentPushState === installedPushState && originalPushState) {
          globalScope.history.pushState = originalPushState;
        }

        if (isProxied && currentReplaceState === installedReplaceState && originalReplaceState) {
          globalScope.history.replaceState = originalReplaceState;
        }
      }

      isTracking = false;
      isProxied = false;
      originalPushState = undefined;
      originalReplaceState = undefined;
      installedPushState = undefined;
      installedReplaceState = undefined;
      eventPropertyCampaign = {};
    },
  };
};
