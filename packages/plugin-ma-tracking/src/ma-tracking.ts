import {
  AdditionalBrowserOptions,
  BaseEvent,
  BeforePlugin,
  BrowserConfig,
  Campaign,
  Event,
  PluginType,
  Storage,
} from '@amplitude/analytics-types';
import type { AmplitudeBrowser } from '@amplitude/analytics-browser';
import { AdvancedCampaignTracker } from './advanced-campaign-tracker';

export class MATrackingPlugin implements BeforePlugin {
  name = 'MATracking';
  type = PluginType.BEFORE as const;

  constructor(private readonly instance: AmplitudeBrowser, private readonly options: AdditionalBrowserOptions = {}) {}

  async setup(config: BrowserConfig): Promise<undefined> {
    const attributionConfig = this.options.attribution ?? {};
    const pageTrackingConfig =
      this.options.trackPageViews ??
      (attributionConfig.trackPageViews && {
        filter: 'onAttribution',
      });

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

    // Disable "runAttributionStrategy" function from instance
    instance.runAttributionStrategy = () => Promise.resolve();

    // Web Attribution tracking
    if (!attributionConfig.disabled) {
      void campaignTracker.onPageChange(async ({ isNewCampaign, currentCampaign }) => {
        if (isNewCampaign) {
          if (attributionConfig.resetSessionOnNewCampaign) {
            instance.setSessionId(Date.now());
          }
          await instance.track(campaignTracker.createCampaignEvent(currentCampaign));
        }
      });
    }

    // Page View tracking
    if (pageTrackingConfig) {
      const filter = typeof pageTrackingConfig === 'boolean' || pageTrackingConfig.filter;
      void campaignTracker.onPageChange(async ({ isNewCampaign }) => {
        switch (filter) {
          case 'onAttribution': {
            return isNewCampaign && (await instance.track(this.createPageViewEvent()));
          }
          default: {
            if (typeof filter === 'function' && !filter()) return;
            return instance.track(this.createPageViewEvent());
          }
        }
      });
    }

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
