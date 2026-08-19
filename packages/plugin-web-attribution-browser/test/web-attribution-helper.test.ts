import {
  BASE_CAMPAIGN,
  BrowserConfig,
  CampaignParser,
  CookieStorage,
  FetchTransport,
  LogLevel,
  Logger,
  UUID,
} from '@amplitude/analytics-core';
import { isNewSession, WebAttribution } from '../src/helpers';

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

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('tracks and stores a new campaign', async () => {
    const webAttribution = new WebAttribution({}, { ...mockConfig, cookieOptions: undefined });
    jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({
      ...BASE_CAMPAIGN,
      utm_source: 'amp-test',
    });
    jest.spyOn(webAttribution.storage, 'get').mockResolvedValueOnce({ ...BASE_CAMPAIGN });
    const set = jest.spyOn(webAttribution.storage, 'set').mockResolvedValueOnce();

    await webAttribution.init();

    expect(webAttribution.shouldTrackNewCampaign).toBe(true);
    expect(set).toHaveBeenCalledWith(webAttribution.storageKey, webAttribution.currentCampaign);
  });

  test('does not track an unchanged campaign', async () => {
    const campaign = { ...BASE_CAMPAIGN };
    const webAttribution = new WebAttribution({}, mockConfig);
    jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce(campaign);
    jest.spyOn(webAttribution.storage, 'get').mockResolvedValueOnce(campaign);

    await webAttribution.init();

    expect(webAttribution.shouldTrackNewCampaign).toBe(false);
  });

  test('ignores direct traffic in the current session', async () => {
    const webAttribution = new WebAttribution(
      {},
      {
        ...mockConfig,
        lastEventTime: Date.now(),
      },
    );
    jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({ ...BASE_CAMPAIGN });
    jest.spyOn(webAttribution.storage, 'get').mockResolvedValueOnce({
      ...BASE_CAMPAIGN,
      referrer: 'https://www.google.com',
      referring_domain: 'www.google.com',
    });

    await webAttribution.init();

    expect(webAttribution.shouldTrackNewCampaign).toBe(false);
  });

  test('tracks direct traffic in a new session', async () => {
    const webAttribution = new WebAttribution(
      {},
      {
        ...mockConfig,
        lastEventTime: Date.now() - 2 * mockConfig.sessionTimeout,
      },
    );
    jest.spyOn(CampaignParser.prototype, 'parse').mockResolvedValueOnce({ ...BASE_CAMPAIGN });
    jest.spyOn(webAttribution.storage, 'get').mockResolvedValueOnce({
      ...BASE_CAMPAIGN,
      referrer: 'https://www.google.com',
      referring_domain: 'www.google.com',
    });

    await webAttribution.init();

    expect(webAttribution.shouldTrackNewCampaign).toBe(true);
  });

  test('generates a campaign event with an event id', () => {
    const webAttribution = new WebAttribution({ resetSessionOnNewCampaign: true }, mockConfig);
    webAttribution.shouldTrackNewCampaign = true;

    expect(webAttribution.shouldSetSessionIdOnNewCampaign()).toBe(true);
    expect(webAttribution.generateCampaignEvent(1).event_id).toBe(1);
    expect(webAttribution.shouldSetSessionIdOnNewCampaign()).toBe(false);
    expect(webAttribution.generateCampaignEvent().event_id).toBeUndefined();
  });
});

describe('isNewSession', () => {
  test('compares the last event time with the session timeout', () => {
    expect(isNewSession(1000, Date.now())).toBe(false);
    expect(isNewSession(1000, Date.now() - 2000)).toBe(true);
  });

  test('uses the current time when the last event time is omitted', () => {
    expect(isNewSession(1000)).toBe(false);
  });
});
