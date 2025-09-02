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
} from '@amplitude/analytics-core';
import { WebAttribution } from '../../src/attribution/web-attribution';

describe('shouldTrackNewCampaign', () => {
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
