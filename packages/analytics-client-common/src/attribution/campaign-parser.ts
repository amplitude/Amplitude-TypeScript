import { getQueryParams } from '../query-params';
import {
  UTM_CAMPAIGN,
  UTM_CONTENT,
  UTM_MEDIUM,
  UTM_SOURCE,
  UTM_TERM,
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
  async parse(): Promise<Campaign> {
    return {
      ...BASE_CAMPAIGN,
      ...this.getUtmParam(),
      ...this.getReferrer(),
      ...this.getClickIds(),
    } as Campaign;
  }

  getUtmParam(): UTMParameters {
    const params = getQueryParams();

    const utmSource = params[UTM_SOURCE];
    const utmMedium = params[UTM_MEDIUM];
    const utmCampaign = params[UTM_CAMPAIGN];
    const utmTerm = params[UTM_TERM];
    const utmContent = params[UTM_CONTENT];

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
