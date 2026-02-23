import {
  createIdentifyEvent,
  Identify,
  ILogger,
  Campaign,
  BASE_CAMPAIGN,
  getGlobalScope,
  ExcludeInternalReferrersOptions,
} from '@amplitude/analytics-core';

export interface Options {
  excludeReferrers?: (string | RegExp)[];
  excludeInternalReferrers?: true | false | ExcludeInternalReferrersOptions;
  initialEmptyValue?: string;
  resetSessionOnNewCampaign?: boolean;
  optOut?: boolean;
}

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

// type guard to check if excludeInternalReferrers is a valid ExcludeInternalReferrersOptions object
// (needed because this is a user provided option that may not have the benefit of compile-time type checking)
function isValidExcludeInternalReferrersType(
  excludeInternalReferrers: ExcludeInternalReferrersOptions | boolean,
): boolean {
  if (typeof excludeInternalReferrers === 'boolean') {
    return true;
  }
  if (typeof excludeInternalReferrers === 'object') {
    if (
      typeof excludeInternalReferrers.condition === 'string' &&
      ['always', 'ifEmptyCampaign'].includes(excludeInternalReferrers.condition)
    ) {
      return true;
    } else if (typeof excludeInternalReferrers.condition === 'undefined') {
      return true;
    }
  }
  return false;
}

function parseExcludeInternalReferrersCondition(
  excludeInternalReferrers: ExcludeInternalReferrersOptions | boolean,
): ExcludeInternalReferrersOptions['condition'] {
  if (typeof excludeInternalReferrers === 'object' && excludeInternalReferrers.condition) {
    return excludeInternalReferrers.condition;
  }
  return 'always';
}

function debugLogInternalReferrerExclude(
  condition: ExcludeInternalReferrersOptions['condition'],
  referringDomain: string,
  logger: ILogger,
) {
  const baseMessage = `This is not a new campaign because referring_domain=${referringDomain} is on the same domain as the current page and it is configured to exclude internal referrers`;
  if (condition === 'always') {
    logger.debug(baseMessage);
  } else if (condition === 'ifEmptyCampaign') {
    logger.debug(`${baseMessage} and it is configured to exclude internal referrers with empty campaign parameters`);
  }
}

export const isNewCampaign = (
  current: Campaign,
  previous: Campaign | undefined,
  options: Options,
  logger: ILogger,
  isNewSession = true,
) => {
  const { referrer, referring_domain, ...currentCampaign } = current;
  const { referrer: _previous_referrer, referring_domain: prevReferringDomain, ...previousCampaign } = previous || {};

  const { excludeInternalReferrers } = options;

  if (excludeInternalReferrers) {
    // type-check excludeInternalReferrers for JS type safety
    if (isValidExcludeInternalReferrersType(excludeInternalReferrers)) {
      if (current.referring_domain && isInternalReferrer(current.referring_domain)) {
        const condition = parseExcludeInternalReferrersCondition(excludeInternalReferrers);
        if (condition === 'always') {
          debugLogInternalReferrerExclude(condition, current.referring_domain, logger);
          return false;
        } else if (condition === 'ifEmptyCampaign' && isEmptyCampaign(current)) {
          debugLogInternalReferrerExclude(condition, current.referring_domain, logger);
          return false;
        }
      }
    } else {
      logger.error(
        `Invalid configuration provided for attribution.excludeInternalReferrers: ${JSON.stringify(
          excludeInternalReferrers,
        )}`,
      );
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

function getDomain(hostname: string) {
  const parts = hostname.split('.');
  let tld = parts[parts.length - 1];
  let name = parts[parts.length - 2];
  if (KNOWN_2LDS.find((tld) => hostname.endsWith(`.${tld}`))) {
    tld = parts[parts.length - 2] + '.' + parts[parts.length - 1];
    name = parts[parts.length - 3];
  }

  if (!name) return tld;

  return `${name}.${tld}`;
}

export const isSameDomain = (domain1: string, domain2: string) => {
  if (domain1 === domain2) return true;

  if (getDomain(domain1) === getDomain(domain2)) return true;

  return false;
};

const isInternalReferrer = (referringDomain: string) => {
  const globalScope = getGlobalScope();
  /* istanbul ignore if */
  if (!globalScope) return false;
  return isSameDomain(referringDomain, globalScope.location.hostname);
};

export const isEmptyCampaign = (campaign: Campaign) => {
  const campaignWithoutReferrer = { ...campaign, referring_domain: undefined, referrer: undefined };
  return Object.values(campaignWithoutReferrer).every((value) => !value);
};
