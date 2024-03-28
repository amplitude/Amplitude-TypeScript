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
    const [currentCampaign, previousCampaign] = await Promise.all([
      new CampaignParser().parse(),
      this.storage.get(this.storageKey),
    ]);
    //console.log('currentCampaign: ', currentCampaign);
    //console.log('previousCampaign: ', previousCampaign);
    if (isNewCampaign(currentCampaign, previousCampaign, this.options)) {
      return true;
    }
    return false;
  }

  /**
   * This can be called when
   * 1. set a new session
   * 2. has new campaign and enable resetSessionOnNewCampaign
   */
  async track() {
    const currentCampaign = await new CampaignParser().parse();
    if (await this.shouldTrackNewCampaign()) {
      //console.log('in web attribution track');
      const campaignEvent = createCampaignEvent(currentCampaign, this.options);
      this.amplitude.track(campaignEvent);
      //console.log('after track campaignEvent');
      await this.storage.set(this.storageKey, currentCampaign);
    }
  }
}
