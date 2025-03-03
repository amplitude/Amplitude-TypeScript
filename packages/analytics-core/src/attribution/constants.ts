import { Campaign } from '@amplitude/analytics-types';

export const UTM_CAMPAIGN = 'utm_campaign';
export const UTM_CONTENT = 'utm_content';
export const UTM_ID = 'utm_id';
export const UTM_MEDIUM = 'utm_medium';
export const UTM_SOURCE = 'utm_source';
export const UTM_TERM = 'utm_term';

export const DCLID = 'dclid';
export const FBCLID = 'fbclid';
export const GBRAID = 'gbraid';
export const GCLID = 'gclid';
export const KO_CLICK_ID = 'ko_click_id';
export const LI_FAT_ID = 'li_fat_id';
export const MSCLKID = 'msclkid';
export const RDT_CID = 'rtd_cid';
export const TTCLID = 'ttclid';
export const TWCLID = 'twclid';
export const WBRAID = 'wbraid';

export const EMPTY_VALUE = 'EMPTY';

export const BASE_CAMPAIGN: Campaign = {
  utm_campaign: undefined,
  utm_content: undefined,
  utm_id: undefined,
  utm_medium: undefined,
  utm_source: undefined,
  utm_term: undefined,
  referrer: undefined,
  referring_domain: undefined,
  dclid: undefined,
  gbraid: undefined,
  gclid: undefined,
  fbclid: undefined,
  ko_click_id: undefined,
  li_fat_id: undefined,
  msclkid: undefined,
  rtd_cid: undefined,
  ttclid: undefined,
  twclid: undefined,
  wbraid: undefined,
};

export const MKTG = 'MKTG';
