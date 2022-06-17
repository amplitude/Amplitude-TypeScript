import { createIdentifyEvent, Identify } from '@amplitude/analytics-core';
import {
  Storage,
  Campaign,
  CampaignParser as ICampaignParser,
  CampaignTracker as ICampaignTracker,
  CampaignTrackFunction,
  CampaignTrackerOptions,
  BaseEvent,
} from '@amplitude/analytics-types';
import { getCookieName as getStorageKey } from '../utils/cookie-name';
import { CampaignParser } from './campaign-parser';
import { BASE_CAMPAIGN, EMPTY_VALUE, MKTG } from './constants';

export class CampaignTracker implements ICampaignTracker {
  storage: Storage<Campaign>;
  storageKey: string;
  parser: ICampaignParser;
  track: CampaignTrackFunction;
  onNewCampaign: (campaign: Campaign) => unknown;

  disabled: boolean;
  trackNewCampaigns: boolean;
  trackPageViews: boolean;
  excludeReferrers: string[];
  initialEmptyValue: string;

  constructor(apiKey: string, options: CampaignTrackerOptions) {
    this.storage = options.storage;
    this.storageKey = getStorageKey(apiKey, MKTG);
    this.parser = new CampaignParser();
    this.track = options.track;
    this.onNewCampaign = options.onNewCampaign;

    this.disabled = Boolean(options.disabled);
    this.trackNewCampaigns = Boolean(options.trackNewCampaigns);
    this.trackPageViews = options.trackPageViews === undefined || Boolean(options.trackPageViews);
    this.excludeReferrers = options.excludeReferrers ?? [];
    if (typeof location !== 'undefined') {
      this.excludeReferrers.unshift(location.hostname);
    }
    this.initialEmptyValue = options.initialEmptyValue ?? EMPTY_VALUE;
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

  saveCampaignToStorage(campaign: Campaign) {
    this.storage.set(this.storageKey, campaign);
  }

  getCampaignFromStorage(): Campaign {
    return this.storage.get(this.storageKey) || { ...BASE_CAMPAIGN };
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

    const pageViewEvent: BaseEvent = {
      event_type: 'Page View',
      event_properties: {
        page_title: /* istanbul ignore next */ (typeof document !== 'undefined' && document.title) || '',
        page_location: /* istanbul ignore next */ (typeof location !== 'undefined' && location.href) || '',
        page_path: /* istanbul ignore next */ (typeof location !== 'undefined' && location.pathname) || '',
      },
    };
    return {
      ...createIdentifyEvent(undefined, undefined, identifyEvent),
      ...(this.trackPageViews && pageViewEvent),
    };
  }

  async send(isNewSession: boolean) {
    if (this.disabled) {
      return;
    }
    const currentCampaign = this.parser.parse();
    const previousCampaign = this.getCampaignFromStorage();
    if (!isNewSession) {
      if (!this.trackNewCampaigns || !this.isNewCampaign(currentCampaign, previousCampaign)) {
        return;
      }
      this.onNewCampaign(currentCampaign);
    }
    await this.track(this.createCampaignEvent(currentCampaign));
    this.saveCampaignToStorage(currentCampaign);
  }
}
