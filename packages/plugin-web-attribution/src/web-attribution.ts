import { IAmplitudeBrowser } from '@amplitude/analytics-browser';
import {
  BeforePlugin,
  BrowserClient,
  BrowserConfig,
  Campaign,
  Event,
  PluginType,
  Storage,
} from '@amplitude/analytics-types';
import { AdvancedCampaignTracker } from './advanced-campaign-tracker';
import { AttributionPluginOptions } from './typings/web-attribution';

export class WebAttributionPlugin implements BeforePlugin {
  name = 'web-attribution';
  type = PluginType.BEFORE as const;

  constructor(
    private readonly instance: BrowserClient | IAmplitudeBrowser,
    private readonly options: AttributionPluginOptions = {},
  ) {}

  async setup(config: BrowserConfig): Promise<undefined> {
    // Merge plugin options and attribution config from BrowserConfig
    const attributionConfig = (config.attribution = Object.assign({}, config.attribution, this.options));

    // Disable "runAttributionStrategy" function
    attributionConfig.disabled = true;

    // New campaigns are now always tracked by default. Setting trackNewCampaigns to true also sets resetSessionOnNewCampaign to true.
    if (attributionConfig.trackNewCampaigns && typeof attributionConfig.resetSessionOnNewCampaign === 'undefined') {
      attributionConfig.resetSessionOnNewCampaign = true;
    }

    const instance = this.instance;
    // Share cookie storage with user session storage
    const storage = config.cookieStorage as unknown as Storage<Campaign>;

    const campaignTracker = new AdvancedCampaignTracker(config.apiKey, {
      ...attributionConfig,
      trackPageViews: false,
      track: /* istanbul ignore next */ () => Promise.resolve(),
      onNewCampaign: /* istanbul ignore next */ () => () => undefined,
      storage,
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

    return Promise.resolve(undefined);
  }

  async execute(context: Event): Promise<Event> {
    return context;
  }
}
