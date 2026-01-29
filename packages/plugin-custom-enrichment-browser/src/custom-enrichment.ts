import type {
  BrowserClient,
  BrowserConfig,
  CustomEnrichmentOptions,
  EnrichmentPlugin,
  Event,
  ILogger,
  RemoteConfig,
} from '@amplitude/analytics-core';

export const customEnrichmentPlugin = (): EnrichmentPlugin => {
  let loggerProvider: ILogger | undefined;

  let enrichEvent: ((event: Event) => Event) | undefined;

  function isCustomEnrichmentConfig(config: RemoteConfig): config is CustomEnrichmentOptions {
    // 1. Check if it's an object and not null
    if (typeof config !== 'object' || config === null) {
      return false;
    }

    // 2. Validate specific properties exist and are the correct type
    return 'body' in config && typeof config.body === 'string';
  }

  function createEnrichEvent(body: string): (event: Event) => Event {
    if (body) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-implied-eval
        return new Function('event', body) as (event: Event) => Event;
      } catch (error) {
        loggerProvider?.error('Could not create custom enrichment function', error);
      }
    }

    // if there was no content, return a function that returns the event unchanged
    return (event: Event) => event;
  }

  const plugin: EnrichmentPlugin = {
    name: '@amplitude/plugin-custom-enrichment-browser',
    type: 'enrichment',

    setup: async (config: BrowserConfig, _: BrowserClient) => {
      loggerProvider = config.loggerProvider;
      loggerProvider?.log('Installing @amplitude/plugin-custom-enrichment-browser');

      // Fetch remote config for custom enrichment in a non-blocking manner
      if (config.remoteConfig?.fetchRemoteConfig) {
        if (!config.remoteConfigClient) {
          // TODO(xinyi): Diagnostics.recordEvent
          loggerProvider?.debug('Remote config client is not provided, skipping remote config fetch');
        } else {
          config.remoteConfigClient.subscribe(
            'configs.analyticsSDK.browserSDK.customEnrichment',
            'all',
            (remoteConfig: RemoteConfig | null) => {
              if (remoteConfig) {
                if (isCustomEnrichmentConfig(remoteConfig)) {
                  enrichEvent = createEnrichEvent((remoteConfig.body as string) || '');
                }
              }
            },
          );
        }
      }
    },
    execute: async (event: Event) => {
      if (enrichEvent) {
        try {
          return enrichEvent(event) ?? null;
        } catch (error) {
          loggerProvider?.error('Could not execute custom enrichment function', error);
          return event;
        }
      }

      return event;
    },
    teardown: async () => {
      // No teardown required
    },
  };

  return plugin;
};
