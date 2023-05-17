import { CampaignParser } from '@amplitude/analytics-client-common';
import {
  BeforePlugin,
  BrowserClient,
  BrowserConfig,
  Campaign,
  Event,
  PluginType,
  Storage,
} from '@amplitude/analytics-types';
import { createCampaignEvent, getStorageKey, isNewCampaign } from './helpers';
import { CreateWebAttributionPlugin, Options } from './typings/web-attribution';

export const webAttributionPlugin: CreateWebAttributionPlugin = function (options: Options = {}) {
  let amplitude: BrowserClient | undefined;

  const excludeReferrers = options.excludeReferrers ?? [];
  if (typeof location !== 'undefined') {
    excludeReferrers.unshift(location.hostname);
  }

  options = {
    initialEmptyValue: 'EMPTY',
    resetSessionOnNewCampaign: false,
    ...options,
    excludeReferrers,
  };

  const plugin: BeforePlugin = {
    name: '@amplitude/plugin-web-attribution-browser',
    type: PluginType.BEFORE,

    setup: async function (config: BrowserConfig, client: BrowserClient) {
      amplitude = client;

      config.loggerProvider.log('Installing @amplitude/plugin-web-attribution-browser.');

      // Share cookie storage with user session storage
      const storage = config.cookieStorage as unknown as Storage<Campaign>;
      const storageKey = getStorageKey(config.apiKey, 'MKTG');

      const [currentCampaign, previousCampaign] = await Promise.all([
        new CampaignParser().parse(),
        storage.get(storageKey),
      ]);

      if (isNewCampaign(currentCampaign, previousCampaign, options)) {
        if (options.resetSessionOnNewCampaign) {
          amplitude.setSessionId(Date.now());
          config.loggerProvider.log('Created a new session for new campaign.');
        }
        config.loggerProvider.log('Tracking attribution.');
        const campaignEvent = createCampaignEvent(currentCampaign, options);
        amplitude.track(campaignEvent);
        void storage.set(storageKey, currentCampaign);
      }
    },

    execute: async (event: Event) => event,
  };

  return plugin;
};
