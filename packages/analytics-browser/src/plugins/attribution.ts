import {
  BeforePlugin,
  BrowserConfig,
  Event,
  PluginType,
  AdditionalBrowserOptions,
  PluginSetupOptions,
  Campaign,
} from '@amplitude/analytics-types';
import { CampaignTracker } from '../attribution/campaign-tracker';
import { AmplitudeBrowser } from '../browser-client';
import { createFlexibleStorage } from '../config';

export class Attribution implements BeforePlugin {
  name = 'attribution';
  type = PluginType.BEFORE as const;

  constructor(private readonly options: AdditionalBrowserOptions = {}) {}

  async setup(config: BrowserConfig, options: PluginSetupOptions): Promise<undefined> {
    const attributionConfig = this.options.attribution ?? {};

    if (attributionConfig.disabled) {
      return Promise.resolve(undefined);
    }

    const instance = options.instance as AmplitudeBrowser;
    const storage = await createFlexibleStorage<Campaign>(config);

    const campaignTracker = new CampaignTracker(config.apiKey, {
      ...attributionConfig,
      storage,
    });

    void instance.timeline.ready.then(() =>
      campaignTracker.onStateChange(async () => {
        void campaignTracker.trackOn('onAttribution', (currentCampaign) => {
          if (campaignTracker.resetSessionOnNewCampaign) {
            instance.setSessionId(Date.now());
          }
          return instance.track(campaignTracker.createCampaignEvent(currentCampaign));
        });
      }),
    );
    return Promise.resolve(undefined);
  }

  async execute(context: Event): Promise<Event> {
    return context;
  }
}
