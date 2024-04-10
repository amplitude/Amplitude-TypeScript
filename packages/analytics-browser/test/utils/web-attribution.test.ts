import { BASE_CAMPAIGN, CampaignParser, CookieStorage, FetchTransport } from '@amplitude/analytics-client-common';
import { Logger, UUID } from '@amplitude/analytics-core';
import { AttributionOptions, BrowserConfig, LogLevel } from '@amplitude/analytics-types';
import { WebAttribution } from '../../src/utils/web-attribution';

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

  test('should generate campaign event with given eventId', async () => {
    const webAttribution = new WebAttribution(option, mockConfig);
    const event_id = 1;
    const campaignEvent = webAttribution.generateCampaignEvent(event_id);
    expect(campaignEvent.event_id).toBe(event_id);
  });

  test('should track campaign with new campaign', async () => {
    const overrideMockConfig = {
      ...mockConfig,
      cookieOptions: undefined,
    };
    const webAttribution = new WebAttribution(option, overrideMockConfig);

    jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValue({
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
});
