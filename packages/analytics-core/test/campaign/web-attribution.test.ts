/**
 * @jest-environment jsdom
 */

import {
  FetchTransport,
  CookieStorage,
  Logger,
  UUID,
  AttributionOptions,
  BrowserConfig,
  LogLevel,
  BASE_CAMPAIGN,
  CampaignParser,
  WebAttribution,
  createCampaignEvent,
  getDefaultExcludedReferrers,
  isExcludedReferrer,
} from '../../src';

describe('WebAttribution', () => {
  const mockConfig: BrowserConfig = {
    apiKey: UUID(),
    flushIntervalMillis: 0,
    flushMaxRetries: 0,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: new Logger(),
    offline: false,
    optOut: false,
    serverUrl: undefined,
    transportProvider: new FetchTransport(),
    useBatch: false,
    cookieOptions: {
      domain: '.amplitude.com',
      expiration: 365,
      sameSite: 'Lax',
      secure: false,
      upgrade: true,
    },
    cookieStorage: new CookieStorage(),
    sessionTimeout: 30 * 60 * 1000,
    trackingOptions: {
      ipAddress: true,
      language: true,
      platform: true,
    },
  };
  const option: AttributionOptions = {};

  test('should track campaign with new campaign', async () => {
    const overrideMockConfig = {
      ...mockConfig,
      cookieOptions: undefined,
    };
    const webAttribution = new WebAttribution(option, overrideMockConfig);

    jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({
      ...BASE_CAMPAIGN,
      utm_source: 'amp-test',
    });
    jest.spyOn(webAttribution.storage, 'get').mockResolvedValueOnce({
      ...BASE_CAMPAIGN,
    });

    await webAttribution.init();
    expect(webAttribution.shouldTrackNewCampaign).toBe(true);
  });

  test('should not track campaign without new campaign', async () => {
    const overrideMockConfig = {
      ...mockConfig,
      cookieOptions: undefined,
    };
    const emptyCampaign = { ...BASE_CAMPAIGN };
    const webAttribution = new WebAttribution(option, overrideMockConfig);

    jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValue(emptyCampaign);
    jest.spyOn(webAttribution.storage, 'get').mockResolvedValue(emptyCampaign);

    await webAttribution.init();
    expect(webAttribution.shouldTrackNewCampaign).toBe(false);
  });

  test('should generate campaign event with given eventId', async () => {
    const webAttribution = new WebAttribution(option, mockConfig);
    const event_id = 1;
    const campaignEvent = webAttribution.generateCampaignEvent(event_id);
    expect(campaignEvent.event_id).toBe(event_id);
  });

  test('should set session id on a new Campaign', async () => {
    const option = {
      resetSessionOnNewCampaign: true,
    };
    const webAttribution = new WebAttribution(option, mockConfig);
    jest.spyOn(webAttribution.storage, 'get').mockResolvedValue(undefined);
    await webAttribution.init();

    expect(webAttribution.shouldSetSessionIdOnNewCampaign()).toBe(true);
  });

  test('should not set session id on a new Campaign', async () => {
    const option = {
      resetSessionOnNewCampaign: true,
    };
    const webAttribution = new WebAttribution(option, mockConfig);
    await webAttribution.init();

    webAttribution.generateCampaignEvent();
    expect(webAttribution.shouldSetSessionIdOnNewCampaign()).toBe(false);
  });

  test('should ignore the campaign for direct traffic in session', async () => {
    const lastEventTime = Date.now();

    const overrideMockConfig = {
      ...mockConfig,
      // In session event
      lastEventTime,
    };
    const webAttribution = new WebAttribution({}, overrideMockConfig);
    const previousCampaign = {
      ...BASE_CAMPAIGN,
      referrer: 'https://www.google.com',
      referring_domain: 'www.google.com',
    };

    jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValue(BASE_CAMPAIGN); // Direct Traffic
    jest.spyOn(webAttribution.storage, 'get').mockResolvedValue(previousCampaign);

    await webAttribution.init();
    expect(webAttribution.shouldTrackNewCampaign).toBe(false);
  });

  test('should not ignore the campaign for direct traffic in new session', async () => {
    const lastEventTime = Date.now() - 2 * 30 * 60 * 1000;

    const overrideMockConfig = {
      ...mockConfig,
      // Out of session event
      lastEventTime,
    };

    const webAttribution = new WebAttribution({}, overrideMockConfig);
    const previousCampaign = {
      ...BASE_CAMPAIGN,
      referrer: 'https://www.google.com',
      referring_domain: 'www.google.com',
    };

    jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValue(BASE_CAMPAIGN); // Direct Traffic
    jest.spyOn(webAttribution.storage, 'get').mockImplementation((key: string) => {
      if (key === webAttribution.webExpStorageKey) {
        return Promise.resolve(undefined);
      }
      if (key === webAttribution.storageKey) {
        return Promise.resolve(previousCampaign);
      }
      return Promise.resolve(undefined);
    });

    await webAttribution.init();
    expect(webAttribution.shouldTrackNewCampaign).toBe(true);
  });

  test('should use original campaign from MKTG_ORIGINAL when available', async () => {
    const webAttribution = new WebAttribution({}, mockConfig);
    const originalCampaign = {
      ...BASE_CAMPAIGN,
      utm_source: 'original-source',
      utm_campaign: 'original-campaign',
    };
    const previousCampaign = {
      ...BASE_CAMPAIGN,
      utm_source: 'previous-source',
    };

    jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValue({
      ...BASE_CAMPAIGN,
      utm_source: 'parsed-source',
    });

    jest.spyOn(webAttribution.storage, 'get').mockImplementation((key: string) => {
      if (key === webAttribution.webExpStorageKey) {
        return Promise.resolve(originalCampaign); // Original campaign exists
      }
      if (key === webAttribution.storageKey) {
        return Promise.resolve(previousCampaign);
      }
      return Promise.resolve(undefined);
    });

    const removeSpy = jest.spyOn(webAttribution.storage, 'remove').mockResolvedValue();

    await webAttribution.init();

    expect(webAttribution.currentCampaign).toEqual(originalCampaign);
    expect(webAttribution.previousCampaign).toEqual(previousCampaign);
    expect(removeSpy).toHaveBeenCalledWith(webAttribution.webExpStorageKey);
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

  test('should return true with regexp excluded referrer', () => {
    expect(isExcludedReferrer(getDefaultExcludedReferrers('.amplitude.com'), 'data.amplitude.com')).toEqual(true);
  });
});
