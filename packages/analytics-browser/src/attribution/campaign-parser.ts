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
  AdditionalCampaignParameters,
} from '@amplitude/analytics-types';

export class CampaignParser implements ICampaignParser {
  utmCookieStorage = new UTMCookie();

  constructor(public additionalCampaignParameters: string[] = []) {}

  async parse(): Promise<Campaign> {
    const params = getQueryParams();

    return {
      ...BASE_CAMPAIGN,
      ...(await this.getUtmParam(params)),
      ...this.getReferrer(),
      ...this.getClickIds(params),
      ...this.getAdditionalCampaignParameters(params),
    } as Campaign;
  }

  async getUtmParam(params: Record<string, string | undefined>): Promise<UTMParameters> {
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

  getClickIds(params: Record<string, string | undefined>): ClickIdParameters {
    return {
      [GCLID]: params[GCLID],
      [FBCLID]: params[FBCLID],
    };
  }

  getAdditionalCampaignParameters(params: Record<string, string | undefined>): AdditionalCampaignParameters {
    const additionalParams: AdditionalCampaignParameters = {};
    this.additionalCampaignParameters.forEach((param) => {
      additionalParams[param] = params[param];
    });
    return additionalParams;
  }
}
