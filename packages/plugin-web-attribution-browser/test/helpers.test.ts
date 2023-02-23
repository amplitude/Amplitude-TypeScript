import { BASE_CAMPAIGN } from '@amplitude/analytics-client-common';
import { getStorageKey, isNewCampaign, createCampaignEvent } from '../src/helpers';

describe('getStorageKey', () => {
  test('should return storage key without explicit suffix and limit', () => {
    expect(getStorageKey('API_KEY')).toBe('AMP_API_KEY');
  });

  test('should return storage key', () => {
    expect(getStorageKey('API_KEY', 'MKTG', 3)).toBe('AMP_MKTG_API');
  });
});

describe('isNewCampaign', () => {
  test('should return true for new campaign', () => {
    const previousCampaign = {
      ...BASE_CAMPAIGN,
    };
    const currentCampaign = {
      ...BASE_CAMPAIGN,
      utm_campaign: 'utm_campaign',
    };
    expect(isNewCampaign(currentCampaign, previousCampaign, {})).toBe(true);
  });

  test('should return true for new referrer', () => {
    const previousCampaign = {
      ...BASE_CAMPAIGN,
      utm_campaign: 'utm_campaign',
      referring_domain: 'a.b.c.d',
    };
    const currentCampaign = {
      ...BASE_CAMPAIGN,
      utm_campaign: 'utm_campaign',
      referring_domain: 'b.c.d.e',
    };
    expect(isNewCampaign(currentCampaign, previousCampaign, {})).toBe(true);
  });

  test('should return false for excluded referrer', () => {
    const previousCampaign = {
      ...BASE_CAMPAIGN,
    };
    const currentCampaign = {
      ...BASE_CAMPAIGN,
      referring_domain: 'a',
    };
    expect(
      isNewCampaign(currentCampaign, previousCampaign, {
        excludeReferrers: ['a'],
      }),
    ).toBe(false);
  });

  test('should return true for undefined previous campaign', () => {
    const previousCampaign = undefined;
    const currentCampaign = {
      ...BASE_CAMPAIGN,
    };
    expect(
      isNewCampaign(currentCampaign, previousCampaign, {
        excludeReferrers: ['a'],
      }),
    ).toBe(true);
  });

  test('should return false for undefined previous campaign and excluded referrer', () => {
    const previousCampaign = undefined;
    const currentCampaign = {
      ...BASE_CAMPAIGN,
      referring_domain: 'a',
    };
    expect(
      isNewCampaign(currentCampaign, previousCampaign, {
        excludeReferrers: ['a'],
      }),
    ).toBe(false);
  });
});

describe('createCampaignEvent', () => {
  test('should return event', () => {
    const campaignEvent = createCampaignEvent(
      {
        ...BASE_CAMPAIGN,
        utm_campaign: 'utm_campaign',
      },
      {},
    );
    expect(campaignEvent).toEqual({
      event_type: '$identify',
      user_id: undefined,
      user_properties: {
        $set: {
          utm_campaign: 'utm_campaign',
        },
        $setOnce: {
          initial_dclid: 'EMPTY',
          initial_fbclid: 'EMPTY',
          initial_gbraid: 'EMPTY',
          initial_gclid: 'EMPTY',
          initial_ko_click_id: 'EMPTY',
          initial_msclkid: 'EMPTY',
          initial_wbraid: 'EMPTY',
          initial_referrer: 'EMPTY',
          initial_referring_domain: 'EMPTY',
          initial_ttclid: 'EMPTY',
          initial_twclid: 'EMPTY',
          initial_utm_campaign: 'utm_campaign',
          initial_utm_content: 'EMPTY',
          initial_utm_id: 'EMPTY',
          initial_utm_medium: 'EMPTY',
          initial_utm_source: 'EMPTY',
          initial_utm_term: 'EMPTY',
        },
        $unset: {
          dclid: '-',
          fbclid: '-',
          gbraid: '-',
          gclid: '-',
          ko_click_id: '-',
          msclkid: '-',
          wbraid: '-',
          referrer: '-',
          referring_domain: '-',
          ttclid: '-',
          twclid: '-',
          utm_content: '-',
          utm_id: '-',
          utm_medium: '-',
          utm_source: '-',
          utm_term: '-',
        },
      },
    });
  });

  test('should return event with custom empty value', () => {
    const campaignEvent = createCampaignEvent(
      {
        ...BASE_CAMPAIGN,
        utm_campaign: 'utm_campaign',
      },
      {
        initialEmptyValue: '(none)',
      },
    );
    expect(campaignEvent).toEqual({
      event_type: '$identify',
      user_id: undefined,
      user_properties: {
        $set: {
          utm_campaign: 'utm_campaign',
        },
        $setOnce: {
          initial_dclid: '(none)',
          initial_fbclid: '(none)',
          initial_gbraid: '(none)',
          initial_gclid: '(none)',
          initial_ko_click_id: '(none)',
          initial_msclkid: '(none)',
          initial_wbraid: '(none)',
          initial_referrer: '(none)',
          initial_referring_domain: '(none)',
          initial_ttclid: '(none)',
          initial_twclid: '(none)',
          initial_utm_campaign: 'utm_campaign',
          initial_utm_content: '(none)',
          initial_utm_id: '(none)',
          initial_utm_medium: '(none)',
          initial_utm_source: '(none)',
          initial_utm_term: '(none)',
        },
        $unset: {
          dclid: '-',
          fbclid: '-',
          gbraid: '-',
          gclid: '-',
          ko_click_id: '-',
          msclkid: '-',
          wbraid: '-',
          referrer: '-',
          referring_domain: '-',
          ttclid: '-',
          twclid: '-',
          utm_content: '-',
          utm_id: '-',
          utm_medium: '-',
          utm_source: '-',
          utm_term: '-',
        },
      },
    });
  });
});