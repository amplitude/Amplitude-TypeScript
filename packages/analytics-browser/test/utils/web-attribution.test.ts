import { BASE_CAMPAIGN, CampaignParser, CookieStorage, FetchTransport } from '@amplitude/analytics-client-common';
import { Logger, UUID } from '@amplitude/analytics-core';
import { AttributionOptions, BrowserConfig, LogLevel } from '@amplitude/analytics-types';
import { createInstance } from '@amplitude/analytics-browser';
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

  test('should track new campaign', async () => {
    const amplitude = createInstance();
    const webAttribution = new WebAttribution(option, amplitude, mockConfig);

    jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValue({
      ...BASE_CAMPAIGN,
      utm_source: 'amp-test',
    });
    jest.spyOn(webAttribution.storage, 'get').mockResolvedValueOnce({
      ...BASE_CAMPAIGN,
    });
    const track = jest.spyOn(amplitude, 'track').mockReturnValueOnce({
      promise: Promise.resolve({
        code: 200,
        message: '',
        event: {
          event_type: 'event_type',
        },
      }),
    });

    await webAttribution.track();
    expect(track).toHaveBeenCalledTimes(1);
  });

  test('should not track new campaign', async () => {
    const overrideMockConfig = {
      ...mockConfig,
      cookieOptions: undefined,
    };
    const emptyCampaign = { ...BASE_CAMPAIGN };
    const amplitude = createInstance();
    const webAttribution = new WebAttribution(option, amplitude, overrideMockConfig);

    jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValue(emptyCampaign);
    jest.spyOn(webAttribution.storage, 'get').mockResolvedValue(emptyCampaign);

    const track = jest.spyOn(amplitude, 'track').mockReturnValueOnce({
      promise: Promise.resolve({
        code: 200,
        message: '',
        event: {
          event_type: 'event_type',
        },
      }),
    });

    await webAttribution.track();
    expect(track).toHaveBeenCalledTimes(0);
  });
});
