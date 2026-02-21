import { ExcludeInternalReferrersOptions } from '@amplitude/analytics-core/lib/esm/types/config/browser-config';
import {
  isNewCampaign,
  createCampaignEvent,
  getDefaultExcludedReferrers,
  isExcludedReferrer,
  isSameDomain,
} from '../../src/attribution/helpers';

import { getStorageKey, BASE_CAMPAIGN } from '@amplitude/analytics-core';

const loggerProvider = {
  log: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  enable: jest.fn(),
  disable: jest.fn(),
};

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
    expect(isNewCampaign(currentCampaign, previousCampaign, {}, loggerProvider)).toBe(true);
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
    expect(isNewCampaign(currentCampaign, previousCampaign, {}, loggerProvider)).toBe(true);
  });

  test('should return false for string excluded referrer', () => {
    const previousCampaign = {
      ...BASE_CAMPAIGN,
    };
    const currentCampaign = {
      ...BASE_CAMPAIGN,
      referring_domain: 'amplitude.com',
    };
    expect(
      isNewCampaign(
        currentCampaign,
        previousCampaign,
        {
          excludeReferrers: ['amplitude.com'],
        },
        loggerProvider,
      ),
    ).toBe(false);
  });

  test('should return false for regexp excluded referrer', () => {
    const previousCampaign = {
      ...BASE_CAMPAIGN,
    };
    const currentCampaign = {
      ...BASE_CAMPAIGN,
      referring_domain: 'amplitude.com',
    };
    expect(
      isNewCampaign(
        currentCampaign,
        previousCampaign,
        {
          excludeReferrers: getDefaultExcludedReferrers('.amplitude.com'),
        },
        loggerProvider,
      ),
    ).toBe(false);
  });

  test('should return false for cross subdomain regexp excluded referrer', () => {
    const previousCampaign = {
      ...BASE_CAMPAIGN,
    };
    const currentCampaign = {
      ...BASE_CAMPAIGN,
      referring_domain: 'analytics.amplitude.com',
    };
    expect(
      isNewCampaign(
        currentCampaign,
        previousCampaign,
        {
          excludeReferrers: getDefaultExcludedReferrers('.amplitude.com'),
        },
        loggerProvider,
      ),
    ).toBe(false);
  });

  test('should return true for undefined previous campaign', () => {
    const previousCampaign = undefined;
    const currentCampaign = {
      ...BASE_CAMPAIGN,
    };
    expect(
      isNewCampaign(
        currentCampaign,
        previousCampaign,
        {
          excludeReferrers: ['a'],
        },
        loggerProvider,
      ),
    ).toBe(true);
  });

  test('should return false for undefined previous campaign and excluded referrer', () => {
    const previousCampaign = undefined;
    const currentCampaign = {
      ...BASE_CAMPAIGN,
      referring_domain: 'a',
    };
    expect(
      isNewCampaign(
        currentCampaign,
        previousCampaign,
        {
          excludeReferrers: ['a'],
        },
        loggerProvider,
      ),
    ).toBe(false);
  });

  test('should return false for no extra referrer with direct traffic in the same session', () => {
    const previousCampaign = {
      ...BASE_CAMPAIGN,
      utm_campaign: 'utm_campaign',
      referring_domain: 'a.b.c.d',
    };
    const currentCampaign = {
      ...BASE_CAMPAIGN,
    };

    expect(isNewCampaign(currentCampaign, previousCampaign, {}, loggerProvider, false)).toBe(false);
  });

  test('should return true for no referrer with any new campaign in the same session', () => {
    const previousCampaign = {
      ...BASE_CAMPAIGN,
      utm_campaign: 'utm_campaign',
      referring_domain: 'a.b.c.d',
    };
    const currentCampaign = {
      ...BASE_CAMPAIGN,
      utm_source: 'utm_source',
    };

    expect(isNewCampaign(currentCampaign, previousCampaign, {}, loggerProvider, false)).toBe(true);
  });

  describe('when excludeInternalReferrers', () => {
    let location: Location;

    beforeAll(() => {
      location = window.location;
      Object.defineProperty(window, 'location', {
        value: {
          hostname: 'a.b.co.uk',
        },
        writable: true,
      });
    });

    afterAll(() => {
      Object.defineProperty(window, 'location', {
        value: location,
        writable: true,
      });
    });

    describe('is true (or "always")', () => {
      test('should return false if internal referrer', () => {
        const previousCampaign = {
          ...BASE_CAMPAIGN,
          referring_domain: 'a.b.co.uk',
        };
        const currentCampaign = {
          ...BASE_CAMPAIGN,
          referring_domain: 'b.co.uk',
        };

        expect(
          isNewCampaign(currentCampaign, previousCampaign, { excludeInternalReferrers: true }, loggerProvider),
        ).toBe(false);
      });

      test('should return true if not internal referrer', () => {
        const previousCampaign = {
          ...BASE_CAMPAIGN,
          referring_domain: 'facebook.com',
        };
        const currentCampaign = {
          ...BASE_CAMPAIGN,
          referring_domain: 'google.com',
        };
        expect(
          isNewCampaign(currentCampaign, previousCampaign, { excludeInternalReferrers: true }, loggerProvider),
        ).toBe(true);
      });

      test('should return false if no referring_domain', () => {
        const previousCampaign = {
          ...BASE_CAMPAIGN,
        };
        const currentCampaign = {
          ...BASE_CAMPAIGN,
        };
        expect(
          isNewCampaign(currentCampaign, previousCampaign, { excludeInternalReferrers: true }, loggerProvider),
        ).toBe(false);
      });

      test('should return false if no referring domain', () => {
        const previousCampaign = {
          ...BASE_CAMPAIGN,
        };
        const currentCampaign = {
          ...BASE_CAMPAIGN,
        };
        expect(
          isNewCampaign(
            currentCampaign,
            previousCampaign,
            { excludeInternalReferrers: { condition: 'always' } },
            loggerProvider,
          ),
        ).toBe(false);
      });
    });

    describe('is "ifEmptyCampaign"', () => {
      test('should return false if internal referrer and campaign is empty', () => {
        const previousCampaign = {
          ...BASE_CAMPAIGN,
          referring_domain: 'a.b.co.uk',
        };
        const currentCampaign = {
          ...BASE_CAMPAIGN,
          referring_domain: 'a.b.co.uk',
        };
        expect(
          isNewCampaign(
            currentCampaign,
            previousCampaign,
            { excludeInternalReferrers: { condition: 'ifEmptyCampaign' } },
            loggerProvider,
          ),
        ).toBe(false);
      });

      test('should return true if not internal referrer and campaign is not empty', () => {
        const previousCampaign = {
          ...BASE_CAMPAIGN,
          utm_campaign: 'previous_campaign',
          referring_domain: 'facebook.com',
        };
        const currentCampaign = {
          ...BASE_CAMPAIGN,
          utm_campaign: 'new_campaign',
          referring_domain: 'google.com',
        };
        expect(
          isNewCampaign(
            currentCampaign,
            previousCampaign,
            { excludeInternalReferrers: { condition: 'ifEmptyCampaign' } },
            loggerProvider,
          ),
        ).toBe(true);
      });
    });

    describe('is invalid', () => {
      test('should silently ignore invalid condition', () => {
        const previousCampaign = {
          ...BASE_CAMPAIGN,
          utm_campaign: 'previous_campaign',
          referring_domain: 'a.b.co.uk',
        };
        const currentCampaign = {
          ...BASE_CAMPAIGN,
          utm_campaign: 'new_campaign',
          referring_domain: 'a.b.co.uk',
        };
        const excludeInternalReferrers = { condition: 'invalid' } as unknown as ExcludeInternalReferrersOptions;
        expect(isNewCampaign(currentCampaign, previousCampaign, { excludeInternalReferrers }, loggerProvider)).toBe(
          true,
        );
      });
    });
  });
});

describe('isExcludedReferrer', () => {
  test('should return true with string excluded referrer', () => {
    expect(isExcludedReferrer(['data.amplitude.com'], 'data.amplitude.com')).toEqual(true);
  });

  test('should return true with regexp excluded referrer', () => {
    expect(isExcludedReferrer(getDefaultExcludedReferrers('.amplitude.com'), 'data.amplitude.com')).toEqual(true);
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
          initial_li_fat_id: 'EMPTY',
          initial_msclkid: 'EMPTY',
          initial_wbraid: 'EMPTY',
          initial_referrer: 'EMPTY',
          initial_referring_domain: 'EMPTY',
          initial_rdt_cid: 'EMPTY',
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
          li_fat_id: '-',
          msclkid: '-',
          wbraid: '-',
          referrer: '-',
          referring_domain: '-',
          rdt_cid: '-',
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
          initial_li_fat_id: '(none)',
          initial_msclkid: '(none)',
          initial_wbraid: '(none)',
          initial_referrer: '(none)',
          initial_referring_domain: '(none)',
          initial_rdt_cid: '(none)',
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
          li_fat_id: '-',
          msclkid: '-',
          wbraid: '-',
          referrer: '-',
          referring_domain: '-',
          rdt_cid: '-',
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

describe('getDefaultExcludedReferrers', () => {
  test('should return empty array', () => {
    const excludedReferrers = getDefaultExcludedReferrers(undefined);
    expect(excludedReferrers).toEqual([]);
  });

  test('should return array with regex 1', () => {
    const excludedReferrers = getDefaultExcludedReferrers('amplitude.com');
    expect(excludedReferrers).toEqual([new RegExp('amplitude\\.com$')]);
  });

  test('should return array with regex 2', () => {
    const excludedReferrers = getDefaultExcludedReferrers('.amplitude.com');
    expect(excludedReferrers).toEqual([new RegExp('amplitude\\.com$')]);
  });
});

describe('isSameDomain', () => {
  describe('should return true if 2 domains', () => {
    test('have the same domain', () => {
      expect(isSameDomain('amplitude.com', 'amplitude.com')).toBe(true);
    });
    test('have the same subdomain', () => {
      expect(isSameDomain('www.amplitude.com', 'www.amplitude.com')).toBe(true);
      expect(isSameDomain('sub.domain.amplitude.com', 'sub.domain.amplitude.com')).toBe(true);
    });
    test('have the same domain but a different subdomain', () => {
      expect(isSameDomain('amplitude.com', 'docs.amplitude.com')).toBe(true);
      expect(isSameDomain('docs.amplitude.com', 'amplitude.com')).toBe(true);
      expect(isSameDomain('app.amplitude.com', 'docs.amplitude.com')).toBe(true);
      expect(isSameDomain('app.amplitude.com', 'some.app.amplitude.com')).toBe(true);
      expect(isSameDomain('some.app.amplitude.com', 'app.amplitude.com')).toBe(true);
    });
    test('are localhost', () => {
      expect(isSameDomain('localhost', 'localhost')).toBe(true);
    });
  });

  describe('should return false if 2 domains', () => {
    test('have different domains', () => {
      expect(isSameDomain('amplitude.com', 'example.com')).toBe(false);
      expect(isSameDomain('amplitude.domain.com', 'amplitude.com')).toBe(false);
      expect(isSameDomain('amplitude.domain.com', 'docs.amplitude.com')).toBe(false);
      expect(isSameDomain('localhost', 'amplitude.com')).toBe(false);
    });
  });
});
