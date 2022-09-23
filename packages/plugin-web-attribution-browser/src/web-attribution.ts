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
import { Options } from './typings/web-attribution';

export const webAttributionPlugin = (client: BrowserClient, options: Options = {}): BeforePlugin => ({
  name: 'web-attribution',
  type: PluginType.BEFORE,

  setup: async (config: BrowserConfig) => {
    config.loggerProvider.log('Installing @amplitude/plugin-web-attribution-browser');

    // Disable "runAttributionStrategy" function
    if (!config.attribution?.disabled) {
      config.loggerProvider.warn(
        '@amplitude/plugin-web-attribution-browser overrides web attribution behavior defined in @amplitude/analytics-browser',
      );
      config.attribution = {
        disabled: true,
      };
    }

    // Share cookie storage with user session storage
    const storage = config.cookieStorage as unknown as Storage<Campaign>;

    const campaignTracker = new PluginCampaignTracker(config.apiKey, storage, {
      ...options,
    });

    // Web Attribution tracking
    void campaignTracker.onPageChange(async ({ isNewCampaign, currentCampaign }) => {
      if (isNewCampaign) {
        if (options.resetSessionOnNewCampaign) {
          client.setSessionId(Date.now());
          config.loggerProvider.log('Created a new session for new campaign');
        }
        config.loggerProvider.log('Tracking new campaign event');
        void client.track(campaignTracker.createCampaignEvent(currentCampaign));
      }
    });
  },

  execute: async (event: Event) => event,
});
