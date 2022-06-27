import { Campaign } from '@amplitude/analytics-types';

export const UTM_SOURCE = 'utm_source';
export const UTM_MEDIUM = 'utm_medium';
export const UTM_CAMPAIGN = 'utm_campaign';
export const UTM_TERM = 'utm_term';
export const UTM_CONTENT = 'utm_content';

export const UTMZ_SOURCE = 'utmcsr';
export const UTMZ_MEDIUM = 'utmcmd';
export const UTMZ_CAMPAIGN = 'utmccn';
export const UTMZ_TERM = 'utmctr';
export const UTMZ_CONTENT = 'utmcct';

export const GCLID = 'gclid';
export const FBCLID = 'fbclid';

export const EMPTY_VALUE = 'EMPTY';

export const BASE_CAMPAIGN: Campaign = {
  utm_source: undefined,
  utm_medium: undefined,
  utm_campaign: undefined,
  utm_term: undefined,
  utm_content: undefined,
  referrer: undefined,
  referring_domain: undefined,
  gclid: undefined,
  fbclid: undefined,
};

export const MKTG = 'MKTG';
