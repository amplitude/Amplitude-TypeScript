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

  async init() {
    console.log('in init');
    await this.fetchCampaign();
  }

  shouldTrackNewCampaign() {
    console.log('in should tracknew campaign');
    if (isNewCampaign(this.currentCampaign, this.previousCampaign, this.options)) {
      return true;
    }
    return false;
  }

  async fetchCampaign() {
    console.log('in fetch campaign');
    [this.currentCampaign, this.previousCampaign] = await Promise.all([
      new CampaignParser().parse(),
      this.storage.get(this.storageKey),
    ]);

    console.log('current campaign', this.currentCampaign);
    console.log('previous campaign', this.previousCampaign);
  }
  /**
   * This can be called when
   * 1. set a new session
   * 2. has new campaign and enable resetSessionOnNewCampaign
   */
  track() {
    if (this.shouldTrackNewCampaign()) {
      console.log('in web attribution track');
      const campaignEvent = createCampaignEvent(this.currentCampaign, this.options);
      this.amplitude.track(campaignEvent);
      console.log('after track campaignEvent');
      void this.storage.set(this.storageKey, this.currentCampaign);
    }
  }
}
