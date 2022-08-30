import {
  BeforePlugin,
  ReactNativeConfig,
  Event,
  PluginType,
  AdditionalReactNativeOptions,
  PluginSetupOptions,
  Campaign,
} from '@amplitude/analytics-types';
import { CampaignTracker } from '../attribution/campaign-tracker';
import { AmplitudeReactNative } from '../react-native-client';
import { createFlexibleStorage } from '../config';

export class Attribution implements BeforePlugin {
  name = 'attribution';
  type = PluginType.BEFORE as const;

  constructor(private readonly options: AdditionalReactNativeOptions = {}) {}

  async setup(config: ReactNativeConfig, options: PluginSetupOptions): Promise<undefined> {
    const attributionConfig = this.options.attribution ?? {};

    if (attributionConfig.disabled) {
      return Promise.resolve(undefined);
    }

    const instance = options.instance as AmplitudeReactNative;
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
