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
import { getCookieName as getStorageKey } from '../cookie-name';
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
    this.trackPageViews = Boolean(options.trackPageViews);
    this.excludeReferrers = options.excludeReferrers ?? [];
    if (typeof location !== 'undefined') {
      this.excludeReferrers.unshift(location.hostname);
    }
    this.initialEmptyValue = options.initialEmptyValue ?? EMPTY_VALUE;
  }

  isNewCampaign(current: Campaign, previous: Campaign | undefined, ignoreSubdomainInReferrer = false) {
    const { referrer, referring_domain, ...currentCampaign } = current;
    const { referrer: _previous_referrer, referring_domain: prevReferringDomain, ...previousCampaign } = previous || {};

    if (current.referring_domain && this.excludeReferrers.includes(current.referring_domain)) {
      return false;
    }

    const hasNewCampaign = JSON.stringify(currentCampaign) !== JSON.stringify(previousCampaign);
    const hasNewDomain = ignoreSubdomainInReferrer
      ? domainWithoutSubdomain(referring_domain || '') !== domainWithoutSubdomain(prevReferringDomain || '')
      : referring_domain !== prevReferringDomain;

    return !previous || hasNewCampaign || hasNewDomain;
  }

  async saveCampaignToStorage(campaign: Campaign): Promise<void> {
    await this.storage.set(this.storageKey, campaign);
  }

  async getCampaignFromStorage(): Promise<Campaign | undefined> {
    return await this.storage.get(this.storageKey);
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
      ...createIdentifyEvent(identifyEvent),
      ...(this.trackPageViews && pageViewEvent),
    };
  }

  async send(isNewSession: boolean) {
    if (this.disabled) {
      return;
    }
    const currentCampaign = await this.parser.parse();
    const previousCampaign = await this.getCampaignFromStorage();
    if (!isNewSession) {
      if (!this.trackNewCampaigns || !this.isNewCampaign(currentCampaign, previousCampaign)) {
        return;
      }
      this.onNewCampaign(currentCampaign);
    }
    await this.track(this.createCampaignEvent(currentCampaign));
    await this.saveCampaignToStorage(currentCampaign);
  }
}

const domainWithoutSubdomain = (domain: string) => {
  const parts = domain.split('.');

  if (parts.length <= 2) {
    return domain;
  }

  return parts.slice(parts.length - 2, parts.length).join('.');
};
