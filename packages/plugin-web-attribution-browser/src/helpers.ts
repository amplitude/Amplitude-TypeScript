import { BASE_CAMPAIGN } from '@amplitude/analytics-client-common';
import { AMPLITUDE_PREFIX, createIdentifyEvent, Identify } from '@amplitude/analytics-core';
import { Campaign } from '@amplitude/analytics-types';
import { Options } from './typings/web-attribution';

export const getStorageKey = (apiKey: string, postKey = '', limit = 10) => {
  return [AMPLITUDE_PREFIX, postKey, apiKey.substring(0, limit)].filter(Boolean).join('_');
};

const domainWithoutSubdomain = (domain: string) => {
  const parts = domain.split('.');

  if (parts.length <= 2) {
    return domain;
  }

  return parts.slice(parts.length - 2, parts.length).join('.');
};

export const isNewCampaign = (current: Campaign, previous: Campaign | undefined, options: Options) => {
  const { referrer, referring_domain, ...currentCampaign } = current;
  const { referrer: _previous_referrer, referring_domain: prevReferringDomain, ...previousCampaign } = previous || {};

  if (isExcludedReferrer(options.excludeReferrers, current.referring_domain)) {
    return false;
  }
  const hasNewCampaign = JSON.stringify(currentCampaign) !== JSON.stringify(previousCampaign);
  const hasNewDomain =
    domainWithoutSubdomain(referring_domain || '') !== domainWithoutSubdomain(prevReferringDomain || '');

  return !previous || hasNewCampaign || hasNewDomain;
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
