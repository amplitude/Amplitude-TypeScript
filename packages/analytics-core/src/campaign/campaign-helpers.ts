import { getGlobalScope } from '../global-scope';
import { Identify } from '../identify';
import { createIdentifyEvent } from '../utils/event-builder';
import { Campaign } from '../types/campaign';
import { BASE_CAMPAIGN } from '../types/constants';
import { ILogger } from '../logger';
import {
  AttributionOptions,
  BrowserConfig,
  ExcludeInternalReferrersOptions,
  EXCLUDE_INTERNAL_REFERRERS_CONDITIONS,
} from '../types/config/browser-config';
import { Storage } from '../types/storage';
import { CampaignParser } from './campaign-parser';
import { getStorageKey } from '../storage/helpers';
import { isNewSession } from '../session';

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

const isEmptyCampaign = (campaign: Campaign) => {
  const campaignWithoutReferrer = { ...campaign, referring_domain: undefined, referrer: undefined };
  return Object.values(campaignWithoutReferrer).every((value) => !value);
};

export const isNewCampaign = (
  current: Campaign,
  previous: Campaign | undefined,
  options: Pick<AttributionOptions, 'excludeReferrers' | 'excludeInternalReferrers'>,
  logger: ILogger,
  isNewSession = true,
  topLevelDomain?: string,
) => {
  const { referrer, referring_domain, ...currentCampaign } = current;
  const { referrer: _previous_referrer, referring_domain: prevReferringDomain, ...previousCampaign } = previous || {};

  const { excludeInternalReferrers } = options;

  if (excludeInternalReferrers) {
    const condition = getExcludeInternalReferrersCondition(excludeInternalReferrers, logger);
    if (
      !(condition instanceof TypeError) &&
      current.referring_domain &&
      isInternalReferrer(current.referring_domain, topLevelDomain)
    ) {
      if (condition === 'always') {
        debugLogInternalReferrerExclude(condition, current.referring_domain, logger);
        return false;
      } else if (condition === 'ifEmptyCampaign' && isEmptyCampaign(current)) {
        debugLogInternalReferrerExclude(condition, current.referring_domain, logger);
        return false;
      }
    }
  }

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

export const isSubdomainOf = (subDomain: string, domain: string) => {
  const cookieDomainWithLeadingDot = domain.startsWith('.') ? domain : `.${domain}`;
  const subDomainWithLeadingDot = subDomain.startsWith('.') ? subDomain : `.${subDomain}`;
  if (subDomainWithLeadingDot.endsWith(cookieDomainWithLeadingDot)) return true;
  return false;
};

export const createCampaignEvent = (campaign: Campaign, options: Pick<AttributionOptions, 'initialEmptyValue'>) => {
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

/**
 * Parses the excludeInternalReferrers configuration to determine the condition on which to
 * exclude internal referrers for campaign attribution.
 *
 * If the config is invalid type, log and return a TypeError.
 *
 * (this does explicit type checking so don't have to rely on TS compiler to catch invalid types)
 *
 * @param excludeInternalReferrers - attribution.excludeInternalReferrers configuration
 * @param logger - logger instance to log error when TypeError
 * @returns The condition if the config is valid, TypeError if the config is invalid.
 */
const getExcludeInternalReferrersCondition = (
  excludeInternalReferrers: ExcludeInternalReferrersOptions | boolean,
  logger: ILogger,
): ExcludeInternalReferrersOptions['condition'] | TypeError => {
  if (excludeInternalReferrers === true) {
    return EXCLUDE_INTERNAL_REFERRERS_CONDITIONS.always;
  }
  if (typeof excludeInternalReferrers === 'object') {
    const { condition } = excludeInternalReferrers;
    if (typeof condition === 'string' && Object.keys(EXCLUDE_INTERNAL_REFERRERS_CONDITIONS).includes(condition)) {
      return condition;
    } else if (typeof condition === 'undefined') {
      return EXCLUDE_INTERNAL_REFERRERS_CONDITIONS.always;
    }
  }
  const errorMessage = `Invalid configuration provided for attribution.excludeInternalReferrers: ${JSON.stringify(
    excludeInternalReferrers,
  )}`;
  logger.error(errorMessage);
  return new TypeError(errorMessage);
};

// helper function to log debug message when internal referrer is excluded
// (added this to prevent code duplication and improve readability)
function debugLogInternalReferrerExclude(
  condition: ExcludeInternalReferrersOptions['condition'],
  referringDomain: string,
  logger: ILogger,
) {
  const baseMessage = `This is not a new campaign because referring_domain=${referringDomain} is on the same domain as the current page and it is configured to exclude internal referrers`;
  if (condition === 'always') {
    logger.debug(baseMessage);
  } else if (condition === 'ifEmptyCampaign') {
    logger.debug(`${baseMessage} with empty campaign parameters`);
  }
}

// list of domains that are known ccTLDs that are commonly used
// and are in the Public Suffix List (https://publicsuffix.org/)
export const KNOWN_2LDS = [
  'ac.in',
  'ac.jp',
  'ac.kr',
  'ac.th',
  'ac.uk',
  'ac.za',
  'appspot.com',
  'asn.au',
  'azurewebsites.net',
  'cloudfront.net',
  'myshopify.com',
  'blogspot.com',
  'co.ca',
  'co.in',
  'co.jp',
  'co.kr',
  'co.nz',
  'co.th',
  'co.uk',
  'co.za',
  'com.ar',
  'com.au',
  'com.br',
  'com.cn',
  'com.hk',
  'com.in',
  'com.jp',
  'com.kr',
  'com.mx',
  'com.pl',
  'com.sg',
  'com.tr',
  'com.tw',
  'ed.jp',
  'edu.au',
  'edu.br',
  'edu.cn',
  'edu.hk',
  'edu.sg',
  'edu.th',
  'edu.tr',
  'edu.tw',
  'firebaseapp.com',
  'fly.dev',
  'gc.ca',
  'geek.nz',
  'github.io',
  'gitlab.io',
  'go.jp',
  'go.kr',
  'go.th',
  'gob.ar',
  'gob.mx',
  'gov.au',
  'gov.br',
  'gov.cn',
  'gov.hk',
  'gov.in',
  'gov.pl',
  'gov.sg',
  'gov.tr',
  'gov.tw',
  'gov.uk',
  'gov.za',
  'govt.nz',
  'gr.jp',
  'herokuapp.com',
  'id.au',
  'idv.hk',
  'iwi.nz',
  'lg.jp',
  'ltd.uk',
  'maori.nz',
  'me.uk',
  'mil.kr',
  'ne.jp',
  'ne.kr',
  'net.au',
  'net.br',
  'net.cn',
  'net.hk',
  'net.in',
  'net.nz',
  'net.pl',
  'net.sg',
  'net.tr',
  'net.tw',
  'net.za',
  'onrender.com',
  'or.jp',
  'or.kr',
  'or.th',
  'org.ar',
  'org.au',
  'org.br',
  'org.cn',
  'org.hk',
  'org.in',
  'org.mx',
  'org.nz',
  'org.pl',
  'org.sg',
  'org.tw',
  'org.uk',
  'org.za',
  'pages.dev',
  'pe.kr',
  'plc.uk',
  're.kr',
  'res.in',
  'sch.uk',
  'vercel.app',
  'netlify.app',
  'workers.dev',
];

export const getDomain = (hostnameParam?: string) => {
  /* istanbul ignore next */
  const hostname = hostnameParam || getGlobalScope()?.location?.hostname;
  if (!hostname) {
    return '';
  }
  const parts = hostname.split('.');
  let tld = parts[parts.length - 1];
  let name = parts[parts.length - 2];
  if (KNOWN_2LDS.find((tld) => hostname.endsWith(`.${tld}`))) {
    tld = parts[parts.length - 2] + '.' + parts[parts.length - 1];
    name = parts[parts.length - 3];
  }

  if (!name) return tld;

  return `${name}.${tld}`;
};

const isInternalReferrer = (referringDomain: string, topLevelDomain?: string) => {
  const globalScope = getGlobalScope();
  /* istanbul ignore if */
  if (!globalScope) return false;
  // if referring domain is subdomain of config.cookieDomain, return true
  const internalDomain = (topLevelDomain || '').trim() || getDomain(globalScope.location.hostname);
  return isSubdomainOf(referringDomain, internalDomain);
};

export type WebAttributionOptions = AttributionOptions & {
  optOut?: boolean;
};

export class WebAttribution {
  options: WebAttributionOptions;
  storage: Storage<Campaign>;
  storageKey: string;
  webExpStorageKey: string;
  previousCampaign?: Campaign;
  currentCampaign: Campaign;
  shouldTrackNewCampaign = false;
  sessionTimeout: number;
  lastEventTime?: number;
  logger: ILogger;
  topLevelDomain?: string;
  constructor(options: WebAttributionOptions, config: BrowserConfig) {
    this.options = {
      initialEmptyValue: 'EMPTY',
      resetSessionOnNewCampaign: false,
      excludeReferrers: getDefaultExcludedReferrers(config.cookieOptions?.domain || config.topLevelDomain),
      optOut: config.optOut,
      ...options,
    };
    this.storage = config.cookieStorage as unknown as Storage<Campaign>;
    this.storageKey = getStorageKey(config.apiKey, 'MKTG');
    this.webExpStorageKey = getStorageKey(config.apiKey, 'MKTG_ORIGINAL');
    this.currentCampaign = BASE_CAMPAIGN;
    this.sessionTimeout = config.sessionTimeout;
    this.lastEventTime = config.lastEventTime;
    this.logger = config.loggerProvider;
    this.topLevelDomain = config.topLevelDomain;
    config.loggerProvider.log('Installing web attribution tracking.');
  }

  async init() {
    // skip attribution if optOut is true
    if (this.options.optOut) {
      return;
    }

    [this.currentCampaign, this.previousCampaign] = await this.fetchCampaign();
    const isEventInNewSession = !this.lastEventTime ? true : isNewSession(this.sessionTimeout, this.lastEventTime);

    if (
      isNewCampaign(
        this.currentCampaign,
        this.previousCampaign,
        this.options,
        this.logger,
        isEventInNewSession,
        this.topLevelDomain,
      )
    ) {
      this.shouldTrackNewCampaign = true;
      await this.storage.set(this.storageKey, this.currentCampaign);
    }
  }

  async fetchCampaign() {
    const originalCampaign = await this.storage.get(this.webExpStorageKey);
    if (originalCampaign) {
      await this.storage.remove(this.webExpStorageKey);
    }
    return await Promise.all([originalCampaign || new CampaignParser().parse(), this.storage.get(this.storageKey)]);
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
