import { BASE_CAMPAIGN, ILogger } from '@amplitude/analytics-core';
import { createCampaignEvent, getDefaultExcludedReferrers, isExcludedReferrer, isNewCampaign } from '../src/helpers';

const loggerProvider: ILogger = {
  log: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  enable: jest.fn(),
  disable: jest.fn(),
};

describe('isNewCampaign', () => {
  test('returns true for a changed campaign', () => {
    expect(
      isNewCampaign({ ...BASE_CAMPAIGN, utm_campaign: 'new-campaign' }, { ...BASE_CAMPAIGN }, {}, loggerProvider),
    ).toBe(true);
  });

  test('returns true for a changed root referring domain', () => {
    expect(
      isNewCampaign(
        { ...BASE_CAMPAIGN, utm_campaign: 'campaign', referring_domain: 'b.c.d.e' },
        { ...BASE_CAMPAIGN, utm_campaign: 'campaign', referring_domain: 'a.b.c.d' },
        {},
        loggerProvider,
      ),
    ).toBe(true);
  });

  test.each([
    [['amplitude.com'], 'amplitude.com'],
    [[/amplitude\.com$/], 'analytics.amplitude.com'],
  ])('returns false for an excluded referrer', (excludeReferrers, referring_domain) => {
    expect(
      isNewCampaign({ ...BASE_CAMPAIGN, referring_domain }, { ...BASE_CAMPAIGN }, { excludeReferrers }, loggerProvider),
    ).toBe(false);
  });

  test('returns true when no previous campaign exists', () => {
    expect(isNewCampaign({ ...BASE_CAMPAIGN }, undefined, {}, loggerProvider)).toBe(true);
  });

  test('returns false for excluded traffic when no previous campaign exists', () => {
    expect(
      isNewCampaign(
        { ...BASE_CAMPAIGN, referring_domain: 'amplitude.com' },
        undefined,
        { excludeReferrers: ['amplitude.com'] },
        loggerProvider,
      ),
    ).toBe(false);
  });

  test('returns false for direct traffic in the same session', () => {
    expect(
      isNewCampaign(
        { ...BASE_CAMPAIGN },
        { ...BASE_CAMPAIGN, utm_campaign: 'campaign', referring_domain: 'www.google.com' },
        {},
        loggerProvider,
        false,
      ),
    ).toBe(false);
  });

  test('returns true for a new campaign in the same session', () => {
    expect(
      isNewCampaign(
        { ...BASE_CAMPAIGN, utm_source: 'source' },
        { ...BASE_CAMPAIGN, utm_campaign: 'campaign', referring_domain: 'www.google.com' },
        {},
        loggerProvider,
        false,
      ),
    ).toBe(true);
  });

  test('returns false for an unchanged campaign', () => {
    expect(isNewCampaign({ ...BASE_CAMPAIGN }, { ...BASE_CAMPAIGN }, {}, loggerProvider)).toBe(false);
  });
});

describe('isExcludedReferrer', () => {
  test('matches strings and regular expressions', () => {
    expect(isExcludedReferrer(['data.amplitude.com'], 'data.amplitude.com')).toBe(true);
    expect(isExcludedReferrer([/amplitude\.com$/], 'data.amplitude.com')).toBe(true);
  });

  test('returns false when no referrer matches', () => {
    expect(isExcludedReferrer(undefined, 'example.com')).toBe(false);
    expect(isExcludedReferrer(['amplitude.com'], 'example.com')).toBe(false);
    expect(isExcludedReferrer([/amplitude\.com$/], 'example.com')).toBe(false);
  });
});

describe('createCampaignEvent', () => {
  test.each([undefined, '(none)'])('creates an identify event with initial empty value %s', (initialEmptyValue) => {
    const event = createCampaignEvent(
      {
        ...BASE_CAMPAIGN,
        utm_campaign: 'campaign',
      },
      { initialEmptyValue },
    );

    expect(event).toEqual(
      expect.objectContaining({
        event_type: '$identify',
        user_properties: expect.objectContaining({
          $set: { utm_campaign: 'campaign' },
          $setOnce: expect.objectContaining({
            initial_utm_campaign: 'campaign',
            initial_utm_source: initialEmptyValue ?? 'EMPTY',
          }),
          $unset: expect.objectContaining({
            utm_source: '-',
          }),
        }),
      }),
    );
  });
});

describe('getDefaultExcludedReferrers', () => {
  test('returns no referrers without a cookie domain', () => {
    expect(getDefaultExcludedReferrers(undefined)).toEqual([]);
  });

  test.each(['amplitude.com', '.amplitude.com'])('matches the cookie domain %s', (domain) => {
    expect(getDefaultExcludedReferrers(domain)).toEqual([/amplitude\.com$/]);
  });
});
