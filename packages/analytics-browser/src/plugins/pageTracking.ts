import {
  BeforePlugin,
  BrowserConfig,
  Event,
  PluginType,
  AdditionalBrowserOptions,
  PluginSetupOptions,
  Campaign,
  BaseEvent,
} from '@amplitude/analytics-types';
import { CampaignTracker } from '../attribution/campaign-tracker';
import { AmplitudeBrowser } from '../browser-client';
import { createFlexibleStorage } from '../config';

export class PageTracking implements BeforePlugin {
  name = 'pageTracking';
  type = PluginType.BEFORE as const;

  constructor(private readonly options: AdditionalBrowserOptions = {}) {}

  async setup(config: BrowserConfig, options: PluginSetupOptions): Promise<undefined> {
    const attributionConfig = this.options.attribution ?? {};
    const pageTrackingConfig = this.options.trackPageViews ?? false;

    if (!pageTrackingConfig) {
      return Promise.resolve(undefined);
    }

    const instance = options.instance as AmplitudeBrowser;
    const storage = await createFlexibleStorage<Campaign>(config);

    let { filter = undefined } = typeof pageTrackingConfig === 'object' ? pageTrackingConfig : {};

    if (typeof filter === 'undefined' && attributionConfig.trackPageViews === true) {
      filter = 'onAttribution';
    }

    const campaignTracker = new CampaignTracker(config.apiKey, {
      ...attributionConfig,
      storage,
    });

    void instance.timeline.ready.then(() =>
      campaignTracker.onStateChange(async () => {
        void campaignTracker.trackOn(filter, () => instance.track(this.createPageViewEvent()));
      }),
    );
    return Promise.resolve(undefined);
  }

  async execute(context: Event): Promise<Event> {
    return context;
  }

  private createPageViewEvent(): Event {
    const pageViewEvent: BaseEvent = {
      event_type: 'Page View',
      event_properties: {
        page_title: /* istanbul ignore next */ (typeof document !== 'undefined' && document.title) || '',
        page_location: /* istanbul ignore next */ (typeof location !== 'undefined' && location.href) || '',
        page_path: /* istanbul ignore next */ (typeof location !== 'undefined' && location.pathname) || '',
      },
    };
    return pageViewEvent;
  }
}
