/**
 * @jest-environment jsdom
 */

import { ExcludeInternalReferrersOptions, BASE_CAMPAIGN, getDefaultExcludedReferrers } from '../../src';
import { isNewCampaign, isExcludedReferrer, isSubdomainOf, getDomain } from '../../src/campaign/campaign-helpers';

const loggerProvider = {
  log: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  enable: jest.fn(),
  disable: jest.fn(),
};

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
        expect(isNewCampaign(currentCampaign, previousCampaign, { excludeInternalReferrers: {} }, loggerProvider)).toBe(
          false,
        );
      });

      describe('when cookieDomain is specified', () => {
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
            isNewCampaign(
              currentCampaign,
              previousCampaign,
              { excludeInternalReferrers: true },
              loggerProvider,
              false,
              '.b.co.uk',
            ),
          ).toBe(false);
        });

        test('should return true if not internal referrer', () => {
          const previousCampaign = {
            ...BASE_CAMPAIGN,
            referring_domain: 'www.google.com',
          };
          const currentCampaign = {
            ...BASE_CAMPAIGN,
            referring_domain: 'www.google.co.jp',
          };
          expect(
            isNewCampaign(
              currentCampaign,
              previousCampaign,
              { excludeInternalReferrers: true },
              loggerProvider,
              false,
              '.b.co.uk',
            ),
          ).toBe(true);
        });
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

      test('should return true if internal referrer and campaign is not empty', () => {
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

describe('isSubdomainOf', () => {
  test('should return true if subdomain of domain', () => {
    expect(isSubdomainOf('b.co.uk', 'b.co.uk')).toBe(true); // exact match
    expect(isSubdomainOf('b.co.uk', '.b.co.uk')).toBe(true); // exact match leading dot
    expect(isSubdomainOf('a.b.co.uk', '.b.co.uk')).toBe(true);
    expect(isSubdomainOf('www.b.co.uk', '.b.co.uk')).toBe(true);
    expect(isSubdomainOf('www.b.co.uk', '.co.uk')).toBe(true);
    expect(isSubdomainOf('www.b.co.uk', 'co.uk')).toBe(true);
    expect(isSubdomainOf('.www.b.co.uk', 'b.co.uk')).toBe(true);
  });

  test('should return false if not subdomain of domain', () => {
    expect(isSubdomainOf('b.co.uk', 'a.b.co.uk')).toBe(false);
    expect(isSubdomainOf('b.co.uk', '.a.b.co.uk')).toBe(false);
    expect(isSubdomainOf('www.b.co.uk', 'google.com')).toBe(false);
  });
});

describe('getDomain', () => {
  let location: Location;

  beforeAll(() => {
    location = window.location;
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'sub.domain.hello.world.co.uk',
      },
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      value: location,
      configurable: true,
    });
  });

  test('should return true if both localhost', () => {
    expect(getDomain('localhost')).toBe('localhost');
  });

  test('should return domain of location.hostname if no arg provided', () => {
    expect(getDomain()).toBe('world.co.uk');
  });

  test('should return empty if location.hostname is undefined', () => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: undefined,
      },
      configurable: true,
    });
    expect(getDomain()).toBe('');
  });
});
