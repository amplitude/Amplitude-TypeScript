import { Campaign } from './campaign';

export const UNSET_VALUE = '-';
export const AMPLITUDE_PREFIX = 'AMP';
export const STORAGE_PREFIX = `${AMPLITUDE_PREFIX}_unsent`;
export const DEFAULT_INSTANCE_NAME = '$default_instance';
export const AMPLITUDE_SERVER_URL = 'https://api2.amplitude.com/2/httpapi';
export const EU_AMPLITUDE_SERVER_URL = 'https://api.eu.amplitude.com/2/httpapi';
export const AMPLITUDE_BATCH_SERVER_URL = 'https://api2.amplitude.com/batch';
export const EU_AMPLITUDE_BATCH_SERVER_URL = 'https://api.eu.amplitude.com/batch';

// Campaign constants
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

// list of Network headers that are safe to capture
export const SAFE_HEADERS = [
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-expose-headers',
  'access-control-max-age',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'accept-patch',
  'accept-ranges',
  'age',
  'allow',
  'alt-svc',
  'cache-control',
  'connection',
  'content-disposition',
  'content-encoding',
  'content-language',
  'content-length',
  'content-location',
  'content-md5',
  'content-range',
  'content-type',
  'date',
  'delta-base',
  'etag',
  'expires',
  'im',
  'last-modified',
  'link',
  'location',
  'permanent',
  'p3p',
  'pragma',
  'proxy-authenticate',
  'public-key-pins',
  'retry-after',
  'server',
  'status',
  'strict-transport-security',
  'trailer',
  'transfer-encoding',
  'tk',
  'upgrade',
  'vary',
  'via',
  'warning',
  'www-authenticate',
  'x-b3-traceid',
  'x-frame-options',
];

// list of Network headers to never capture
export const FORBIDDEN_HEADERS = ['authorization', 'cookie', 'set-cookie'];
