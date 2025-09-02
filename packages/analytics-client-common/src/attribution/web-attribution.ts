import { BrowserConfig, Logger } from '@amplitude/analytics-types';
import { Campaign, Storage } from '@amplitude/analytics-types';
import { Options, getDefaultExcludedReferrers, createCampaignEvent, isNewCampaign } from './helpers';
import { getStorageKey } from '../storage/helpers';
import { CampaignParser } from './campaign-parser';
import { BASE_CAMPAIGN } from './constants';
import { isNewSession } from '../session';

export class WebAttribution {
  options: Options;
  storage: Storage<Campaign>;
  storageKey: string;
  previousCampaign?: Campaign;
  currentCampaign: Campaign;
  shouldTrackNewCampaign = false;
  sessionTimeout: number;
  lastEventTime?: number;
  logger: Logger;

  constructor(options: Options, config: BrowserConfig) {
    this.options = {
      initialEmptyValue: 'EMPTY',
      resetSessionOnNewCampaign: false,
      excludeReferrers: getDefaultExcludedReferrers(config.cookieOptions?.domain),
      ...options,
    };
    this.storage = config.cookieStorage as unknown as Storage<Campaign>;
    this.storageKey = getStorageKey(config.apiKey, 'MKTG');
    this.currentCampaign = BASE_CAMPAIGN;
    this.sessionTimeout = config.sessionTimeout;
    this.lastEventTime = config.lastEventTime;
    this.logger = config.loggerProvider;
    config.loggerProvider.log('Installing web attribution tracking.');
  }

  async init() {
    [this.currentCampaign, this.previousCampaign] = await this.fetchCampaign();
    const isEventInNewSession = !this.lastEventTime ? true : isNewSession(this.sessionTimeout, this.lastEventTime);

    if (isNewCampaign(this.currentCampaign, this.previousCampaign, this.options, this.logger, isEventInNewSession)) {
      this.shouldTrackNewCampaign = true;
      await this.storage.set(this.storageKey, this.currentCampaign);
    }
  }

  async fetchCampaign() {
    return await Promise.all([new CampaignParser().parse(), this.storage.get(this.storageKey)]);
  }

  /**
   * This can be called when enable web attribution and either
   * 1. set a new session
   * 2. has new campaign and enable resetSessionOnNewCampaign
   */
  generateCampaignEvent(event_id?: number) {
    // Mark this campaign has been tracked
    this.shouldTrackNewCampaign = false;
    const campaignEvent = createCampaignEvent(this.currentCampaign, this.options);
    if (event_id) {
      campaignEvent.event_id = event_id;
    }
    return campaignEvent;
  }

  shouldSetSessionIdOnNewCampaign() {
    return this.shouldTrackNewCampaign && !!this.options.resetSessionOnNewCampaign;
  }
}
