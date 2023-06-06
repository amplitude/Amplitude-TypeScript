import { CampaignParser } from '@amplitude/analytics-client-common';
import { BeforePlugin, BrowserClient, BrowserConfig, Campaign, Event, Storage } from '@amplitude/analytics-types';
import { createCampaignEvent, getDefaultExcludedReferrers, getStorageKey, isNewCampaign } from './helpers';
import { CreateWebAttributionPlugin, Options } from './typings/web-attribution';

export const webAttributionPlugin: CreateWebAttributionPlugin = function (options: Options = {}) {
  const plugin: BeforePlugin = {
    name: '@amplitude/plugin-web-attribution-browser',
    type: 'before',

    setup: async function (config: BrowserConfig, amplitude: BrowserClient) {
      const pluginConfig = {
        initialEmptyValue: 'EMPTY',
        resetSessionOnNewCampaign: false,
        excludeReferrers: getDefaultExcludedReferrers(config.cookieOptions?.domain),
        ...options,
      };
      config.loggerProvider.log('Installing @amplitude/plugin-web-attribution-browser.');

      // Share cookie storage with user session storage
      const storage = config.cookieStorage as unknown as Storage<Campaign>;
      const storageKey = getStorageKey(config.apiKey, 'MKTG');

      const [currentCampaign, previousCampaign] = await Promise.all([
        new CampaignParser().parse(),
        storage.get(storageKey),
      ]);

      if (isNewCampaign(currentCampaign, previousCampaign, pluginConfig)) {
        if (pluginConfig.resetSessionOnNewCampaign) {
          amplitude.setSessionId(Date.now());
          config.loggerProvider.log('Created a new session for new campaign.');
        }
        config.loggerProvider.log('Tracking attribution.');
        const campaignEvent = createCampaignEvent(currentCampaign, pluginConfig);
        amplitude.track(campaignEvent);
        void storage.set(storageKey, currentCampaign);
      }
    },

    execute: async (event: Event) => event,
  };

  return plugin;
};
