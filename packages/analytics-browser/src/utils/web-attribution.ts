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
//import { returnWrapper } from '@amplitude/analytics-core';

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
    console.log('in should tracknew campaign');
    console.log('this.currentCampaign: ', this.currentCampaign);
    console.log('this.previousCampaign: ', this.previousCampaign);
    await this.storage.set(this.storageKey, this.currentCampaign);
    console.log('after set storage');
    if (isNewCampaign(this.currentCampaign, this.previousCampaign, this.options)) {
      return true;
    }
    return false;
  }

  async fetchCampaign() {
    console.log('in fetch campaign');
    //[this.currentCampaign, this.previousCampaign] =

    return await Promise.all([new CampaignParser().parse(), this.storage.get(this.storageKey)]);

    console.log('current campaign', this.currentCampaign);
    console.log('previous campaign', this.previousCampaign);
  }
  /**
   * This can be called when
   * 1. set a new session
   * 2. has new campaign and enable resetSessionOnNewCampaign
   */
  track(event_id?: number) {
    //
    // if (void this.shouldTrackNewCampaign()) {
    console.log('in web attribution track');
    const campaignEvent = createCampaignEvent(this.currentCampaign, this.options);
    if (event_id) {
      campaignEvent.event_id = event_id;
    }
    // This must be update before track otherwise it will cause infinite loop. since shouldTrackNewCampaign will be called before the storage has been updated.
    // return returnWrapper(this.dispatch(event));
    // console.log('after track campaignEvent');
    // return returnWrapper(this.amplitude.dispatch(campaignEvent));
    // return returnWrapper(this.amplitude.dispatch(campaignEvent));
    return this.amplitude.track(campaignEvent);
    // return;
  }
}
