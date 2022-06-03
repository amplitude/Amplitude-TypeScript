import { createIdentifyEvent, Identify } from '@amplitude/analytics-core';
import {
  Storage,
  Campaign,
  CampaignParser as ICampaignParser,
  CampaignTracker as ICampaignTracker,
  CampaignTrackerFunction,
  CampaignTrackerOptions,
} from '@amplitude/analytics-types';
import { getCookieName as getStorageKey } from '../utils/cookie-name';
import { CampaignParser } from './campaign-parser';
import { EMPTY_VALUE } from './constants';

export class CampaignTracker implements ICampaignTracker {
  storageKey: string;
  campaignParser: ICampaignParser;
  tracker: CampaignTrackerFunction;
  excludeReferrers: string[];
  initialEmptyValue: string;
  onNewCampaign?: (campaign: Campaign) => unknown;

  constructor(public storage: Storage<Campaign>, options: CampaignTrackerOptions) {
    this.campaignParser = new CampaignParser();
    this.storageKey = getStorageKey(options.apiKey, 'MKTG');
    this.tracker = options.tracker ?? (() => Promise.resolve());
    this.excludeReferrers = options.excludeReferrers ?? [];
    if (typeof location !== undefined) {
      this.excludeReferrers.unshift(location.hostname);
    }
    this.initialEmptyValue = options.initialEmptyValue ?? EMPTY_VALUE;
    this.onNewCampaign = options.onNewCampaign;
  }

  isNewCampaign(currentCampaign: Campaign, previousCampaign?: Campaign) {
    const isReferrerExcluded =
      currentCampaign.referring_domain && this.excludeReferrers.includes(currentCampaign.referring_domain);
    const hasCampaign = Boolean(currentCampaign.utm_campaign);
    const isNewCampaign = previousCampaign?.utm_campaign !== currentCampaign.utm_campaign;
    const isNewReferrer = previousCampaign?.referring_domain !== currentCampaign.referring_domain;

    if (hasCampaign && !isReferrerExcluded) {
      return Boolean(isNewCampaign || isNewReferrer);
    }
    return false;
  }

  saveCampaignToStorage(campaign: Campaign) {
    this.storage.set(this.storageKey, campaign);
  }

  getCampaignFromStorage(): Campaign | undefined {
    return this.storage.get(this.storageKey);
  }

  convertCampaignToEvent(campaign: Campaign) {
    const campaignParameters: Campaign = {
      // This object definition allows undefined keys to be iterated on
      // in .reduce() to build indentify object
      utm_source: campaign.utm_source || undefined,
      utm_medium: campaign.utm_medium || undefined,
      utm_campaign: campaign.utm_campaign || undefined,
      utm_term: campaign.utm_term || undefined,
      utm_content: campaign.utm_content || undefined,
      referrer: campaign.referrer || undefined,
      referring_domain: campaign.referring_domain || undefined,
      gclid: campaign.gclid || undefined,
      fbclid: campaign.fbclid || undefined,
    };
    const identifyEvent = Object.entries(campaignParameters).reduce((identify, [key, value]) => {
      identify.setOnce(`initial_${key}`, value || this.initialEmptyValue);
      if (value) {
        return identify.set(key, value);
      }
      return identify.unset(key);
    }, new Identify());
    return createIdentifyEvent(undefined, undefined, identifyEvent);
  }

  async trackCampaign() {
    const previousCampaign = this.getCampaignFromStorage();
    const currentCampaign = this.campaignParser.parse();
    if (this.isNewCampaign(currentCampaign, previousCampaign) && this.onNewCampaign) {
      this.onNewCampaign(currentCampaign);
    }
    await this.tracker(this.convertCampaignToEvent(currentCampaign));
    this.saveCampaignToStorage(currentCampaign);
  }
}
