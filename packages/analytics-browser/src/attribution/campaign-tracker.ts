import { createIdentifyEvent, Identify } from '@amplitude/analytics-core';
import {
  Storage,
  Campaign,
  CampaignParser as ICampaignParser,
  CampaignTracker as ICampaignTracker,
  CampaignTrackerOptions,
  PageTrackingFilter,
} from '@amplitude/analytics-types';
import { getCookieName as getStorageKey } from '../utils/cookie-name';
import { CampaignParser } from './campaign-parser';
import { BASE_CAMPAIGN, EMPTY_VALUE, MKTG } from './constants';

export class CampaignTracker implements ICampaignTracker {
  storage: Storage<Campaign>;
  storageKey: string;
  parser: ICampaignParser;

  disabled: boolean;
  excludeReferrers: string[];
  initialEmptyValue: string;
  resetSessionOnNewCampaign: boolean;

  private _currentCampaign!: Campaign;
  private _isNewCampaign!: boolean;

  constructor(apiKey: string, options: CampaignTrackerOptions) {
    this.storage = options.storage;
    this.storageKey = getStorageKey(apiKey, MKTG);
    this.parser = new CampaignParser();

    this.disabled = Boolean(options.disabled);
    this.excludeReferrers = options.excludeReferrers ?? [];
    this.initialEmptyValue = options.initialEmptyValue ?? EMPTY_VALUE;
    this.resetSessionOnNewCampaign = options.resetSessionOnNewCampaign ?? options.trackNewCampaigns;

    if (typeof location !== 'undefined') {
      this.excludeReferrers.unshift(location.hostname);
    }

    void this.refreshCampaignState();
  }

  private async refreshCampaignState() {
    return Promise.all([this.parser.parse(), this.getCampaignFromStorage()]).then(
      ([currentCampaign, previousCampaign]) => {
        this._isNewCampaign = this.isNewCampaign(currentCampaign, previousCampaign);
        this._currentCampaign = currentCampaign;
      },
    );
  }

  isNewCampaign(currentCampaign: Campaign, previousCampaign: Campaign) {
    const isReferrerExcluded = Boolean(
      currentCampaign.referring_domain && this.excludeReferrers.includes(currentCampaign.referring_domain),
    );
    const hasNewUtm =
      previousCampaign.utm_campaign !== currentCampaign.utm_campaign ||
      previousCampaign.utm_source !== currentCampaign.utm_source ||
      previousCampaign.utm_medium !== currentCampaign.utm_medium ||
      previousCampaign.utm_term !== currentCampaign.utm_term ||
      previousCampaign.utm_content !== currentCampaign.utm_content;
    const hasNewReferrer = previousCampaign.referring_domain !== currentCampaign.referring_domain;

    return !isReferrerExcluded && (hasNewUtm || hasNewReferrer);
  }

  async saveCampaignToStorage(campaign: Campaign): Promise<void> {
    await this.storage.set(this.storageKey, campaign);
  }

  async getCampaignFromStorage(): Promise<Campaign> {
    return (await this.storage.get(this.storageKey)) || { ...BASE_CAMPAIGN };
  }

  createCampaignEvent(campaign: Campaign) {
    const campaignParameters: Campaign = {
      // This object definition allows undefined keys to be iterated on
      // in .reduce() to build indentify object
      ...BASE_CAMPAIGN,
      ...campaign,
    };
    const identifyEvent = Object.entries(campaignParameters).reduce((identify, [key, value]) => {
      identify.setOnce(`initial_${key}`, value || this.initialEmptyValue);
      if (value) {
        return identify.set(key, value);
      }
      return identify.unset(key);
    }, new Identify());

    return createIdentifyEvent(identifyEvent);
  }

  trackOn(filter: PageTrackingFilter = undefined, callback: (currentCampaing: Campaign) => unknown) {
    const { isNewCampaign, currentCampaign } = this.getCurrentState();

    switch (filter) {
      case 'onAttribution': {
        return isNewCampaign && callback(currentCampaign);
      }
      default: {
        if (typeof filter === 'function') {
          return filter() && callback(currentCampaign);
        }
        return callback(currentCampaign);
      }
    }
  }

  async onStateChange(callback: (state: { isNewCampaign: boolean; currentCampaign: Campaign }) => Promise<unknown>) {
    const currentState = this.getCurrentState();
    await callback(currentState);

    if (currentState.isNewCampaign) {
      await this.saveCampaignToStorage(currentState.currentCampaign);
    }
  }

  private getCurrentState() {
    return {
      isNewCampaign: this._isNewCampaign,
      currentCampaign: this._currentCampaign,
    };
  }
}
