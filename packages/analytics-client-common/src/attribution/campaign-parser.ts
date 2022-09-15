import { UTMCookie } from '../storage/utm-cookie';
import { getQueryParams } from '../query-params';
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
  DCLID,
  MSCLKID,
  TWCLID,
  TTCLID,
  KO_CLICK_ID,
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

  async parse(): Promise<Campaign> {
    return {
      ...BASE_CAMPAIGN,
      ...(await this.getUtmParam()),
      ...this.getReferrer(),
      ...this.getClickIds(),
    } as Campaign;
  }

  async getUtmParam(): Promise<UTMParameters> {
    const params = getQueryParams();
    const cookies = ((await this.utmCookieStorage.isEnabled()) && (await this.utmCookieStorage.get('__utmz'))) || {};

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
      [DCLID]: params[DCLID],
      [FBCLID]: params[FBCLID],
      [GCLID]: params[GCLID],
      [KO_CLICK_ID]: params[KO_CLICK_ID],
      [MSCLKID]: params[MSCLKID],
      [TTCLID]: params[TTCLID],
      [TWCLID]: params[TWCLID],
    };
  }
}
