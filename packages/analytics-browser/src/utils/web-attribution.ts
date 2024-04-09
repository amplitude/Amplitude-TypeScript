import { BrowserClient, BrowserConfig } from '@amplitude/analytics-types';
import { Campaign, Storage } from '@amplitude/analytics-types';
import {
  Options,
  getDefaultExcludedReferrers,
  getStorageKey,
  createCampaignEvent,
  isNewCampaign,
} from './web-attribution-helper';
import { CampaignParser } from '@amplitude/analytics-client-common';

export class WebAttribution {
  options: Options;
  storage: Storage<Campaign>;
  storageKey: string;
  amplitude: BrowserClient;
  previousCampaign: Campaign | undefined;
  currentCampaign!: Campaign;

  constructor(options: Options, amplitude: BrowserClient, config: BrowserConfig) {
    this.options = {
      initialEmptyValue: 'EMPTY',
      resetSessionOnNewCampaign: false,
      excludeReferrers: getDefaultExcludedReferrers(config.cookieOptions?.domain),
      ...options,
    };
    this.amplitude = amplitude;
    this.storage = config.cookieStorage as unknown as Storage<Campaign>;
    this.storageKey = getStorageKey(config.apiKey, 'MKTG');
  }

  async shouldTrackNewCampaign() {
    [this.currentCampaign, this.previousCampaign] = await this.fetchCampaign();
    await this.storage.set(this.storageKey, this.currentCampaign);
    if (isNewCampaign(this.currentCampaign, this.previousCampaign, this.options)) {
      return true;
    }
    return false;
  }

  async fetchCampaign() {
    return await Promise.all([new CampaignParser().parse(), this.storage.get(this.storageKey)]);
  }
  /**
   * This can be called when
   * 1. set a new session
   * 2. has new campaign and enable resetSessionOnNewCampaign
   */
  track(event_id?: number) {
    const campaignEvent = createCampaignEvent(this.currentCampaign, this.options);
    if (event_id) {
      campaignEvent.event_id = event_id;
    }
    return this.amplitude.track(campaignEvent);
  }
}
