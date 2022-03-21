import { Identify, identify } from '@amplitude/analytics-core';
import { BrowserConfig, UTMData } from '@amplitude/analytics-types';
import {
  UTM_CAMPAIGN,
  UTM_CONTENT,
  UTM_MEDIUM,
  UTM_SOURCE,
  UTM_TERM,
  UTMZ_SOURCE,
  UTMZ_MEDIUM,
  UTMZ_CAMPAIGN,
  UTMZ_TERM,
  UTMZ_CONTENT,
  GCLID,
  FBCLID,
} from './constants';
import { UTMCookie } from './storage/utm-cookie';
import { getQueryParams } from './utils/query-params';

export const trackAttributions = (config: BrowserConfig) => {
  const attribution = {
    ...(config.includeUtm && getUtmParam()),
    ...(config.includeReferrer && getReferrer()),
    ...(config.includeGclid && getGclid()),
    ...(config.includeFbclid && getFbclid()),
  };

  if (Object.keys(attribution).length === 0) {
    return;
  }

  const id = new Identify();
  Object.entries(attribution).forEach(([key, value]: [string, string]) => {
    if (value) {
      id.setOnce(`initial_${key}`, value);
      id.set(key, value);
    }
  });
  void identify(undefined, undefined, id);
};

export const getUtmParam = (): UTMData => {
  const params = getQueryParams();
  const utmStorage = new UTMCookie();
  const cookies = (utmStorage.isEnabled() && utmStorage.get('__utmz')) || {};

  const utmSource = params[UTM_SOURCE] || cookies[UTMZ_SOURCE];
  const utmMedium = params[UTM_MEDIUM] || cookies[UTMZ_MEDIUM];
  const utmCampaign = params[UTM_CAMPAIGN] || cookies[UTMZ_CAMPAIGN];
  const utmTerm = params[UTM_TERM] || cookies[UTMZ_TERM];
  const utmContent = params[UTM_CONTENT] || cookies[UTMZ_CONTENT];

  const data: UTMData = {};
  if (utmSource) data.utm_source = utmSource;
  if (utmMedium) data.utm_medium = utmMedium;
  if (utmCampaign) data.utm_campaign = utmCampaign;
  if (utmTerm) data.utm_term = utmTerm;
  if (utmContent) data.utm_content = utmContent;
  return data;
};

export const getReferrer = () => {
  /* istanbul ignore next */
  const referrer = typeof document !== undefined ? document.referrer : undefined;
  const referringDomain = referrer?.split('/')[2] ?? undefined;

  const data: Record<string, string | undefined> = {};
  if (referrer !== undefined) data.referrer = referrer;
  if (referringDomain !== undefined) data.referring_domain = referringDomain;
  return data;
};

export const getGclid = () => {
  const params = getQueryParams();
  return {
    ...(params[GCLID] && { [GCLID]: params[GCLID] }),
  };
};

export const getFbclid = () => {
  const params = getQueryParams();
  return {
    ...(params[FBCLID] && { [FBCLID]: params[FBCLID] }),
  };
};
