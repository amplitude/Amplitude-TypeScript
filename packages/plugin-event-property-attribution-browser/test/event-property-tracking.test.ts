import {
  BASE_CAMPAIGN,
  BrowserConfig,
  BrowserClient,
  Campaign,
  CookieStorage,
  FetchTransport,
  LogLevel,
  Logger,
  UUID,
} from '@amplitude/analytics-core';
import { eventPropertyTrackingPlugin } from '../src/event-property-tracking';
import * as Core from '@amplitude/analytics-core';

const createMockBrowserClient = (): jest.Mocked<BrowserClient> =>
  ({
    init: jest.fn(),
    add: jest.fn(),
    remove: jest.fn(),
    track: jest.fn().mockReturnValue({
      promise: Promise.resolve({
        code: 200,
        message: '',
        event: {
          event_type: '[Amplitude] Attribution',
        },
      }),
    }),
    logEvent: jest.fn(),
    identify: jest.fn(),
    groupIdentify: jest.fn(),
    setGroup: jest.fn(),
    revenue: jest.fn(),
    setOptOut: jest.fn(),
    getOptOut: jest.fn(),
    getIdentity: jest.fn(),
    setIdentity: jest.fn(),
    flush: jest.fn(),
    getUserId: jest.fn(),
    setUserId: jest.fn(),
    getDeviceId: jest.fn(),
    setDeviceId: jest.fn(),
    getSessionId: jest.fn(),
    setSessionId: jest.fn(),
    extendSession: jest.fn(),
    reset: jest.fn(),
    setTransport: jest.fn(),
    _setDiagnosticsSampleRate: jest.fn(),
    _enableRequestBodyCompressionExperimental: jest.fn(),
  } as unknown as jest.Mocked<BrowserClient>);

const createConfigurationMock = (overrides: Partial<BrowserConfig> = {}): BrowserConfig =>
  ({
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
    ...overrides,
  } as BrowserConfig);

const createCampaign = (overrides: Partial<Campaign> = {}): Campaign => {
  const campaign = { ...BASE_CAMPAIGN };

  for (const [index, key] of (Object.keys(BASE_CAMPAIGN) as (keyof Campaign)[]).entries()) {
    campaign[key] = `${key}-${index}`;
  }

  return {
    ...campaign,
    ...overrides,
  };
};

describe('eventPropertyTrackingPlugin', () => {
  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);
  let plugin = eventPropertyTrackingPlugin();

  beforeEach(() => {
    plugin = eventPropertyTrackingPlugin();
  });

  afterEach(async () => {
    await plugin.teardown?.();
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    jest.restoreAllMocks();
  });

  test('should attach the current campaign to events', async () => {
    const campaign = createCampaign();
    const parseSpy = jest.spyOn(Core.CampaignParser.prototype, 'parse').mockResolvedValue(campaign);
    const client = createMockBrowserClient();

    await plugin.setup?.(createConfigurationMock(), client);

    const event = await plugin.execute?.({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
        utm_source: 'stale',
      },
    });

    expect(event).toEqual({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
        ...campaign,
      },
    });
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  test('should ignore excludeReferrers for event property tracking', async () => {
    const campaign = createCampaign({
      referrer: 'https://www.google.com',
      referring_domain: 'www.google.com',
      utm_source: 'google',
    });
    jest.spyOn(Core.CampaignParser.prototype, 'parse').mockResolvedValue(campaign);
    plugin = eventPropertyTrackingPlugin({
      excludeReferrers: ['www.google.com'],
    });

    await plugin.setup?.(createConfigurationMock(), createMockBrowserClient());

    const event = await plugin.execute?.({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
      },
    });

    expect(event).toEqual({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
        ...campaign,
      },
    });
  });

  test('should ignore excludeInternalReferrers for event property tracking', async () => {
    const campaign = createCampaign({
      referrer: 'https://analytics.amplitude.com/path',
      referring_domain: 'analytics.amplitude.com',
      utm_source: 'google',
    });
    jest.spyOn(Core.CampaignParser.prototype, 'parse').mockResolvedValue(campaign);
    plugin = eventPropertyTrackingPlugin({
      excludeInternalReferrers: true,
    });

    await plugin.setup?.(
      createConfigurationMock({
        topLevelDomain: '.amplitude.com',
      }),
      createMockBrowserClient(),
    );

    const event = await plugin.execute?.({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
      },
    });

    expect(event).toEqual({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
        ...campaign,
      },
    });
  });

  test('should ignore excludeInternalReferrers ifEmptyCampaign for event property tracking', async () => {
    const campaign = createCampaign({
      referrer: 'https://analytics.amplitude.com/path',
      referring_domain: 'analytics.amplitude.com',
      utm_source: 'google',
    });
    jest.spyOn(Core.CampaignParser.prototype, 'parse').mockResolvedValue(campaign);
    plugin = eventPropertyTrackingPlugin({
      excludeInternalReferrers: { condition: 'ifEmptyCampaign' },
    });

    await plugin.setup?.(
      createConfigurationMock({
        topLevelDomain: '.amplitude.com',
      }),
      createMockBrowserClient(),
    );

    const event = await plugin.execute?.({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
      },
    });

    expect(event).toEqual({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
        ...campaign,
      },
    });
  });

  test('should ignore excludeInternalReferrers ifEmptyCampaign for otherwise empty internal campaigns', async () => {
    const campaign = {
      ...BASE_CAMPAIGN,
      referrer: 'https://analytics.amplitude.com/path',
      referring_domain: 'analytics.amplitude.com',
    };
    jest.spyOn(Core.CampaignParser.prototype, 'parse').mockResolvedValue(campaign);
    plugin = eventPropertyTrackingPlugin({
      excludeInternalReferrers: { condition: 'ifEmptyCampaign' },
    });

    await plugin.setup?.(
      createConfigurationMock({
        topLevelDomain: '.amplitude.com',
      }),
      createMockBrowserClient(),
    );

    const event = await plugin.execute?.({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
        utm_source: 'stale',
      },
    });

    expect(event).toEqual({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
        referrer: 'https://analytics.amplitude.com/path',
        referring_domain: 'analytics.amplitude.com',
        utm_source: 'stale',
      },
    });
  });

  test('should ignore resetSessionOnNewCampaign for event property tracking', async () => {
    const campaign = createCampaign({
      utm_source: 'google',
    });
    jest.spyOn(Core.CampaignParser.prototype, 'parse').mockResolvedValue(campaign);
    plugin = eventPropertyTrackingPlugin({
      resetSessionOnNewCampaign: true,
      trackingMethod: 'eventProperty',
    });

    await plugin.setup?.(createConfigurationMock(), createMockBrowserClient());

    const event = await plugin.execute?.({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
      },
    });

    expect(event).toEqual({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
        ...campaign,
      },
    });
  });

  test('should re-parse only on setup and history changes', async () => {
    const parseSpy = jest
      .spyOn(Core.CampaignParser.prototype, 'parse')
      .mockResolvedValueOnce(
        createCampaign({
          utm_source: 'google',
        }),
      )
      .mockResolvedValueOnce({
        ...BASE_CAMPAIGN,
      });

    await plugin.setup?.(createConfigurationMock(), createMockBrowserClient());
    await plugin.execute?.({
      event_type: 'test-event',
    });

    expect(parseSpy).toHaveBeenCalledTimes(1);

    window.history.pushState(undefined, '', '/next');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(parseSpy).toHaveBeenCalledTimes(2);

    window.history.replaceState(undefined, '', '/next-2');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(parseSpy).toHaveBeenCalledTimes(3);

    const event = await plugin.execute?.({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
        utm_source: 'google',
      },
    });

    expect(parseSpy).toHaveBeenCalledTimes(3);
    expect(event).toEqual({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
        utm_source: 'google',
      },
    });
  });

  test('should restore original history methods on teardown', async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const pushState = window.history.pushState;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const replaceState = window.history.replaceState;

    await plugin.setup?.(createConfigurationMock(), createMockBrowserClient());

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(window.history.pushState).not.toBe(pushState);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(window.history.replaceState).not.toBe(replaceState);

    await plugin.teardown?.();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(window.history.pushState).toBe(pushState);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(window.history.replaceState).toBe(replaceState);
  });

  test('should not overwrite history wrappers installed after setup during teardown', async () => {
    const pushStateWrapper: History['pushState'] = () => undefined;
    const replaceStateWrapper: History['replaceState'] = () => undefined;

    await plugin.setup?.(createConfigurationMock(), createMockBrowserClient());

    window.history.pushState = pushStateWrapper;
    window.history.replaceState = replaceStateWrapper;

    await plugin.teardown?.();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(window.history.pushState).toBe(pushStateWrapper);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(window.history.replaceState).toBe(replaceStateWrapper);
  });

  test('should not enrich identify events', async () => {
    const campaign = createCampaign();
    jest.spyOn(Core.CampaignParser.prototype, 'parse').mockResolvedValue(campaign);

    await plugin.setup?.(createConfigurationMock(), createMockBrowserClient());

    const event = await plugin.execute?.({
      event_type: '$identify',
      event_properties: {
        existing: 'value',
      },
    });

    expect(event).toEqual({
      event_type: '$identify',
      event_properties: {
        existing: 'value',
      },
    });
  });

  test('should skip browser listeners when global scope is unavailable', async () => {
    const campaign = createCampaign({
      utm_source: 'google',
    });
    jest.spyOn(Core, 'getGlobalScope').mockReturnValue(undefined);
    jest.spyOn(Core.CampaignParser.prototype, 'parse').mockResolvedValue(campaign);
    plugin = eventPropertyTrackingPlugin({
      trackingMethod: 'eventProperty',
    });

    await plugin.setup?.(createConfigurationMock(), createMockBrowserClient());

    const event = await plugin.execute?.({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
      },
    });

    expect(event).toEqual({
      event_type: 'test-event',
      event_properties: {
        existing: 'value',
        ...campaign,
      },
    });
  });

  test('should fire fallback attribution events whenever campaign state is updated', async () => {
    const parseSpy = jest
      .spyOn(Core.CampaignParser.prototype, 'parse')
      .mockResolvedValueOnce(
        createCampaign({
          utm_source: 'google',
        }),
      )
      .mockResolvedValueOnce({
        ...BASE_CAMPAIGN,
      })
      .mockResolvedValueOnce(
        createCampaign({
          utm_source: 'bing',
        }),
      );
    plugin = eventPropertyTrackingPlugin({
      fallbackAttributionEvent: true,
    });
    const client = createMockBrowserClient();
    const trackCalls = client.track.mock.calls;

    await plugin.setup?.(createConfigurationMock(), client);

    expect(trackCalls).toHaveLength(1);
    expect(trackCalls[0]).toEqual([
      '[Amplitude] Attribution',
      expect.objectContaining({
        utm_source: 'google',
      }),
    ]);

    window.history.pushState(undefined, '', '/direct');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(trackCalls).toHaveLength(2);
    expect(trackCalls[1]).toEqual(['[Amplitude] Attribution', {}]);
    expect(parseSpy).toHaveBeenCalledTimes(2);

    window.history.pushState(undefined, '', '/campaign');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(trackCalls).toHaveLength(3);
    expect(trackCalls[2]).toEqual([
      '[Amplitude] Attribution',
      expect.objectContaining({
        utm_source: 'bing',
      }),
    ]);
  });
});
