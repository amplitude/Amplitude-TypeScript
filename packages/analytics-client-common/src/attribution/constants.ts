import { Campaign } from '@amplitude/analytics-types';

export const UTM_SOURCE = 'utm_source';
export const UTM_MEDIUM = 'utm_medium';
export const UTM_CAMPAIGN = 'utm_campaign';
export const UTM_TERM = 'utm_term';
export const UTM_CONTENT = 'utm_content';

export const DCLID = 'dclid';
export const FBCLID = 'fbclid';
export const GCLID = 'gclid';
export const KO_CLICK_ID = 'ko_click_id';
export const MSCLKID = 'msclkid';
export const TTCLID = 'ttclid';
export const TWCLID = 'twclid';

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
