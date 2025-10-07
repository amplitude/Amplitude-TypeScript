import { createIdentifyEvent, Identify } from '@amplitude/analytics-core';
import { Campaign, Logger } from '@amplitude/analytics-types';
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
  logger: Logger,
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
