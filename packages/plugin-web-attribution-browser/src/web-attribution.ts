import {
  BeforePlugin,
  BrowserClient,
  BrowserConfig,
  Campaign,
  Event,
  PluginType,
  Storage,
} from '@amplitude/analytics-types';
import { PluginCampaignTracker } from './plugin-campaign-tracker';
import { AttributionPluginOptions } from './typings/web-attribution';

export const webAttributionPlugin = (instance: BrowserClient, options: AttributionPluginOptions = {}): BeforePlugin => {
  return {
    name: 'web-attribution',
    type: PluginType.BEFORE,

    setup: async (config: BrowserConfig) => {
      const attributionConfig = options;

      // Disable "runAttributionStrategy" function
      config.attribution = {
        disabled: true,
      };

      // Share cookie storage with user session storage
      const storage = config.cookieStorage as unknown as Storage<Campaign>;

      const campaignTracker = new PluginCampaignTracker(config.apiKey, storage, {
        ...attributionConfig,
      });

      // Web Attribution tracking
      void campaignTracker.onPageChange(async ({ isNewCampaign, currentCampaign }) => {
        if (isNewCampaign) {
          if (attributionConfig.resetSessionOnNewCampaign) {
            instance.setSessionId(Date.now());
          }
          void instance.track(campaignTracker.createCampaignEvent(currentCampaign));
        }
      });
    },

    execute: async (event: Event) => {
      return event;
    },
  };
};
