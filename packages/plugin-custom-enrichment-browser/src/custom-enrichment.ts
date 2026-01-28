import type { BrowserClient, BrowserConfig, EnrichmentPlugin, Event, ILogger } from '@amplitude/analytics-core';

export const customEnrichmentPlugin = (): EnrichmentPlugin => {
  let loggerProvider: ILogger | undefined;
  let customEnrichmentBody: string | undefined;

  let enrichEvent: (event: Event) => Event | undefined;

  const plugin: EnrichmentPlugin = {
    name: '@amplitude/plugin-custom-enrichment-browser',
    type: 'enrichment',

    setup: async (config: BrowserConfig, _: BrowserClient) => {
      loggerProvider = config.loggerProvider;
      loggerProvider?.log('Installing @amplitude/plugin-custom-enrichment-browser');

      // Fetch remote config for custom enrichment in a non-blocking manner
      if (config.fetchRemoteConfig) {
        if (!config.remoteConfigClient) {
          // TODO(xinyi): Diagnostics.recordEvent
          config.loggerProvider.debug('Remote config client is not provided, skipping remote config fetch');
        } else {
          config.remoteConfigClient.subscribe('analyticsSDK.customEnrichment', 'all', (remoteConfig) => {
            if (remoteConfig) {
              customEnrichmentBody = remoteConfig.body as string;
            }
          });
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-implied-eval
      enrichEvent = new Function('event', customEnrichmentBody || '') as (event: Event) => Event;
    },
    execute: async (event: Event) => {
      try {
        return enrichEvent(event) || null;
      } catch (error) {
        loggerProvider?.error('Could not execute custom enrichment function', error);
      }

      return event;
    },
    teardown: async () => {
      // No teardown required
    },
  };

  return plugin;
};
