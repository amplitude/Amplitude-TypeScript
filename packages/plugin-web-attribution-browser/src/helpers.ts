import {
  createIdentifyEvent,
  Identify,
  BrowserConfig,
  Storage,
  CampaignParser,
  getStorageKey,
} from '@amplitude/analytics-core';
import type { Campaign, ILogger } from '@amplitude/analytics-core';
import { BASE_CAMPAIGN } from './constants';

export interface Options {
  excludeReferrers?: (string | RegExp)[];
  initialEmptyValue?: string;
  resetSessionOnNewCampaign?: boolean;
}

const domainWithoutSubdomain = (domain: string) => {
  const parts = domain.split('.');

  if (parts.length <= 2) {
    return domain;
  }

  return parts.slice(parts.length - 2, parts.length).join('.');
};

//Direct traffic mean no external referral, no UTMs, no click-ids, and no other customer identified marketing campaign url params.
const isDirectTraffic = (current: Campaign) => {
  return Object.values(current).every((value) => !value);
};

export const isNewCampaign = (
  current: Campaign,
  previous: Campaign | undefined,
  options: Options,
  logger: ILogger,
  isNewSession = true,
) => {
  const { referrer, referring_domain, ...currentCampaign } = current;
  const { referrer: _previous_referrer, referring_domain: prevReferringDomain, ...previousCampaign } = previous || {};

  if (isExcludedReferrer(options.excludeReferrers, current.referring_domain)) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    logger.debug(`This is not a new campaign because ${current.referring_domain} is in the exclude referrer list.`);
    return false;
  }

  //In the same session, direct traffic should not override or unset any persisting query params
  if (!isNewSession && isDirectTraffic(current) && previous) {
    logger.debug('This is not a new campaign because this is a direct traffic in the same session.');
    return false;
  }

  const hasNewCampaign = JSON.stringify(currentCampaign) !== JSON.stringify(previousCampaign);
  const hasNewDomain =
    domainWithoutSubdomain(referring_domain || '') !== domainWithoutSubdomain(prevReferringDomain || '');

  const result = !previous || hasNewCampaign || hasNewDomain;

  if (!result) {
    logger.debug("This is not a new campaign because it's the same as the previous one.");
  } else {
    logger.debug(`This is a new campaign. An $identify event will be sent.`);
  }

  return result;
};

export const isExcludedReferrer = (excludeReferrers: (string | RegExp)[] = [], referringDomain = '') => {
  return excludeReferrers.some((value) =>
    value instanceof RegExp ? value.test(referringDomain) : value === referringDomain,
  );
};

export const createCampaignEvent = (campaign: Campaign, options: Options) => {
  const campaignParameters: Campaign = {
    // This object definition allows undefined keys to be iterated on
    // in .reduce() to build indentify object
    ...BASE_CAMPAIGN,
    ...campaign,
  };
  const identifyEvent = Object.entries(campaignParameters).reduce((identify, [key, value]) => {
    identify.setOnce(`initial_${key}`, value ?? options.initialEmptyValue ?? 'EMPTY');
    if (value) {
      return identify.set(key, value);
    }
    return identify.unset(key);
  }, new Identify());

  return createIdentifyEvent(identifyEvent);
};

export const getDefaultExcludedReferrers = (cookieDomain: string | undefined) => {
  let domain = cookieDomain;
  if (domain) {
    if (domain.startsWith('.')) {
      domain = domain.substring(1);
    }
    return [new RegExp(`${domain.replace('.', '\\.')}$`)];
  }
  return [];
};

export class WebAttribution {
  options: Options;
  storage: Storage<Campaign>;
  storageKey: string;
  previousCampaign?: Campaign;
  currentCampaign: Campaign;
  shouldTrackNewCampaign = false;
  sessionTimeout: number;
  lastEventTime?: number;
  logger: ILogger;

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

export const isNewSession = (sessionTimeout: number, lastEventTime: number = Date.now()): boolean => {
  const currentTime = Date.now();
  const timeSinceLastEvent = currentTime - lastEventTime;

  return timeSinceLastEvent > sessionTimeout;
};
