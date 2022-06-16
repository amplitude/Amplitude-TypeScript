import { UTMCookie } from '../storage/utm-cookie';
import { getQueryParams } from '../utils/query-params';
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
  BASE_CAMPAIGN,
} from './constants';
import {
  Campaign,
  CampaignParser as ICampaignParser,
  ClickIdParameters,
  ReferrerParameters,
  UTMParameters,
} from '@amplitude/analytics-types';

export class CampaignParser implements ICampaignParser {
  utmCookieStorage = new UTMCookie();

  parse(): Campaign {
    return {
      ...BASE_CAMPAIGN,
      ...this.getUtmParam(),
      ...this.getReferrer(),
      ...this.getClickIds(),
    };
  }

  getUtmParam(): UTMParameters {
    const params = getQueryParams();
    const cookies = (this.utmCookieStorage.isEnabled() && this.utmCookieStorage.get('__utmz')) || {};

    const utmSource = params[UTM_SOURCE] || cookies[UTMZ_SOURCE];
    const utmMedium = params[UTM_MEDIUM] || cookies[UTMZ_MEDIUM];
    const utmCampaign = params[UTM_CAMPAIGN] || cookies[UTMZ_CAMPAIGN];
    const utmTerm = params[UTM_TERM] || cookies[UTMZ_TERM];
    const utmContent = params[UTM_CONTENT] || cookies[UTMZ_CONTENT];

    return {
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_term: utmTerm,
      utm_content: utmContent,
    };
  }

  getReferrer(): ReferrerParameters {
    const data: ReferrerParameters = {
      referrer: undefined,
      referring_domain: undefined,
    };
    try {
      data.referrer = document.referrer || undefined;
      data.referring_domain = data.referrer?.split('/')[2] ?? undefined;
    } catch {
      // nothing to track
    }
    return data;
  }

  getClickIds(): ClickIdParameters {
    const params = getQueryParams();
    return {
      [GCLID]: params[GCLID],
      [FBCLID]: params[FBCLID],
    };
  }
}
