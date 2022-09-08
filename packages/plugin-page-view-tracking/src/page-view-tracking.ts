import { IAmplitudeBrowser } from '@amplitude/analytics-browser';
import {
  BaseEvent,
  BeforePlugin,
  BrowserClient,
  BrowserConfig,
  Campaign,
  Event,
  PluginType,
  Storage,
} from '@amplitude/analytics-types';
import { PluginCampaignTracker } from './plugin-campaign-tracker';
import { PageTrackingBrowserOptions } from './typings/page-view-tracking';

export class PageViewTrackingPlugin implements BeforePlugin {
  name = 'page-view-tracking';
  type = PluginType.BEFORE as const;

  constructor(
    private readonly instance: BrowserClient | IAmplitudeBrowser,
    private readonly options: PageTrackingBrowserOptions = {},
  ) {}

  async setup(config: BrowserConfig): Promise<undefined> {
    const attributionConfig = config.attribution;
    const pageTrackingConfig = {
      filter: attributionConfig?.trackPageViews ? 'onAttribution' : undefined,
      ...this.options,
    };

    // Turn off sending page view event by "runAttributionStrategy" function
    if (typeof attributionConfig === 'object') {
      attributionConfig.trackPageViews = false;
    }

    const instance = this.instance;
    // Share cookie storage with user session storage
    const storage = config.cookieStorage as unknown as Storage<Campaign>;

    const campaignTracker = new PluginCampaignTracker(config.apiKey, storage, {
      ...attributionConfig,
    });

    const filter = pageTrackingConfig.filter;
    void campaignTracker.onPageChange(async ({ isNewCampaign }) => {
      switch (filter) {
        case 'onAttribution': {
          return isNewCampaign && instance.track(this.createPageViewEvent());
        }
        default: {
          if (typeof filter === 'function' && !filter()) return;
          return instance.track(this.createPageViewEvent());
        }
      }
    });

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
