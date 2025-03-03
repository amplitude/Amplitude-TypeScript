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
  RDT_CID,
  TWCLID,
  TTCLID,
  KO_CLICK_ID,
  LI_FAT_ID,
  GBRAID,
  WBRAID,
  UTM_ID,
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

    const utmCampaign = params[UTM_CAMPAIGN];
    const utmContent = params[UTM_CONTENT];
    const utmId = params[UTM_ID];
    const utmMedium = params[UTM_MEDIUM];
    const utmSource = params[UTM_SOURCE];
    const utmTerm = params[UTM_TERM];

    return {
      utm_campaign: utmCampaign,
      utm_content: utmContent,
      utm_id: utmId,
      utm_medium: utmMedium,
      utm_source: utmSource,
      utm_term: utmTerm,
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
      [GBRAID]: params[GBRAID],
      [GCLID]: params[GCLID],
      [KO_CLICK_ID]: params[KO_CLICK_ID],
      [LI_FAT_ID]: params[LI_FAT_ID],
      [MSCLKID]: params[MSCLKID],
      [RDT_CID]: params[RDT_CID],
      [TTCLID]: params[TTCLID],
      [TWCLID]: params[TWCLID],
      [WBRAID]: params[WBRAID],
    };
  }
}
