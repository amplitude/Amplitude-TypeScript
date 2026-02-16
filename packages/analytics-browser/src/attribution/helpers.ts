import {
  createIdentifyEvent,
  Identify,
  ILogger,
  Campaign,
  BASE_CAMPAIGN,
  getGlobalScope,
} from '@amplitude/analytics-core';

export interface Options {
  excludeReferrers?: (string | RegExp)[] | true;
  initialEmptyValue?: string;
  resetSessionOnNewCampaign?: boolean;
  optOut?: boolean;
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

export const isExcludedReferrer = (excludeReferrers: (string | RegExp)[] | true = [], referringDomain = '') => {
  if (excludeReferrers === true) {
    return true;
  }
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

/**
 * List of 2-level TLD's (not an exhaustive list)
 * This list was compiled by downloading the top 1 million domains
 * from https://tranco-list.eu/ and then filtering for domains that have
 * a 2-level TLD.
 */
const KNOWN_2LDS = [
  'co.uk',
  'gov.uk',
  'ac.uk',
  'co.jp',
  'ne.jp',
  'or.jp',
  'co.kr',
  'or.kr',
  'go.kr',
  'com.au',
  'net.au',
  'org.au',
  'com.br',
  'net.br',
  'org.br',
  'com.cn',
  'net.cn',
  'org.cn',
  'com.mx',
  'github.io',
  'gitlab.io',
  'cloudfront.net',
  'herokuapp.com',
  'appspot.com',
  'azurewebsites.net',
  'firebaseapp.com',
];

/**
 * This function is a best-effort to get the most specific domain from the current page.
 *
 * The reason it's "best-effort" is because we don't have access to the
 * Public Suffix List (https://publicsuffix.org/) to be able to perfectly
 * determine the most specific domain.
 *
 */
function getHostDomain() {
  const globalScope = getGlobalScope();
  const { hostname } = globalScope?.location ?? {};
  if (!hostname || typeof hostname !== 'string') {
    return '';
  }
  const parts = hostname.split('.');
  let tld = parts[parts.length - 1];
  let name = parts[parts.length - 2];
  if (KNOWN_2LDS.find((tld) => hostname.endsWith(tld))) {
    tld = parts[parts.length - 2] + '.' + parts[parts.length - 1];
    name = parts[parts.length - 3];
  }

  if (!name) return tld;

  return name + '.' + tld;
}

export const getDefaultExcludedReferrers = (cookieDomain: string | undefined) => {
  let domain = cookieDomain;
  if (!domain) {
    // if no domain provided in config, call "getHostDomain()"
    // as a best-effort fallback to get the host domain
    domain = getHostDomain();
  }
  if (domain) {
    if (domain.startsWith('.')) {
      domain = domain.substring(1);
    }
    domain = domain.replace(/\./g, '\\.');
    return [new RegExp(`${domain}$`)];
  }
  return [];
};
