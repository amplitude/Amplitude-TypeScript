import { BrowserConfig, LogLevel, Logger, BrowserClient, Plugin, EnrichmentPlugin } from '@amplitude/analytics-types';
import * as sessionReplayBrowser from '@amplitude/session-replay-browser';
import { SessionReplayPlugin, sessionReplayPlugin } from '../src/session-replay';

jest.mock('@amplitude/session-replay-browser');
type MockedSessionReplayBrowser = jest.Mocked<typeof import('@amplitude/session-replay-browser')>;

type MockedLogger = jest.Mocked<Logger>;

type MockedBrowserClient = jest.Mocked<BrowserClient>;

describe('SessionReplayPlugin', () => {
  const { init, setSessionId, getSessionReplayProperties, flush, shutdown } =
    sessionReplayBrowser as MockedSessionReplayBrowser;
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  const mockConfig: BrowserConfig = {
    apiKey: 'static_key',
    flushIntervalMillis: 0,
    flushMaxRetries: 1,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: mockLoggerProvider,
    optOut: false,
    deviceId: '1a2b3c',
    serverUrl: 'url',
    serverZone: 'US',
    useBatch: false,
    sessionId: 123,
    cookieExpiration: 365,
    cookieSameSite: 'Lax',
    cookieSecure: false,
    cookieUpgrade: true,
    disableCookies: false,
    domain: '.amplitude.com',
    sessionTimeout: 30 * 60 * 1000,
    trackingOptions: {
      ipAddress: true,
      language: true,
      platform: true,
    },
  } as unknown as BrowserConfig;

  const plugins: Plugin[] = [];
  const mockAmplitude: MockedBrowserClient = {
    add: jest.fn(),
    remove: jest.fn(),
  } as unknown as MockedBrowserClient;

  beforeEach(() => {
    init.mockReturnValue({
      promise: Promise.resolve(),
    });
    plugins.splice(0, plugins.length);
    mockAmplitude.add.mockImplementation((plugin) => {
      plugins.push(plugin);
      return {
        promise: Promise.resolve(),
      };
    });
    mockAmplitude.remove.mockImplementation((pluginName) => {
      const pluginIndex = plugins.findIndex((plugin) => plugin.name === pluginName);
      plugins.splice(pluginIndex, 1);
      return {
        promise: Promise.resolve(),
      };
    });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  describe('setup', () => {
    test('should log error if not BrowserClient is not provided', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup(mockConfig);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalledWith(
        'SessionReplayPlugin requires v1.9.1+ of the Amplitude SDK.',
      );
    });

    test('should setup plugin', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup(mockConfig, mockAmplitude);
      expect(sessionReplay.config.serverUrl).toBe('url');
      expect(sessionReplay.config.flushMaxRetries).toBe(1);
      expect(sessionReplay.config.flushQueueSize).toBe(0);
      expect(sessionReplay.config.flushIntervalMillis).toBe(0);
    });

    test('should add "@amplitude/plugin-session-replay-enrichment-browser" plugin', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup(mockConfig, mockAmplitude);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockAmplitude.add).toHaveBeenCalledTimes(1);
    });

    // setup does nothing, only testing this for coverage
    test('should exist on "@amplitude/plugin-session-replay-enrichment-browser" plugin', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup(mockConfig, mockAmplitude);

      const sessionReplayEnrichmentPlugin = plugins[0] as EnrichmentPlugin;
      const result = await sessionReplayEnrichmentPlugin.setup(mockConfig, mockAmplitude);

      expect(result).toBe(undefined);
    });

    describe('defaultTracking', () => {
      test('should not change defaultTracking if its set to true', async () => {
        const sessionReplay = new SessionReplayPlugin();
        await sessionReplay.setup(
          {
            ...mockConfig,
            defaultTracking: true,
          },
          mockAmplitude,
        );
        expect(sessionReplay.config.defaultTracking).toBe(true);
      });

      test('should modify defaultTracking to enable sessions if its set to false', async () => {
        const sessionReplay = new SessionReplayPlugin();
        await sessionReplay.setup(
          {
            ...mockConfig,
            defaultTracking: false,
          },
          mockAmplitude,
        );
        expect(sessionReplay.config.defaultTracking).toEqual({
          pageViews: false,
          formInteractions: false,
          fileDownloads: false,
          sessions: true,
        });
      });

      test('should modify defaultTracking to enable sessions if it is an object', async () => {
        const sessionReplay = new SessionReplayPlugin();
        await sessionReplay.setup(
          {
            ...mockConfig,
            defaultTracking: {
              pageViews: false,
            },
          },
          mockAmplitude,
        );
        expect(sessionReplay.config.defaultTracking).toEqual({
          pageViews: false,
          sessions: true,
        });
      });

      test('should not modify defaultTracking to enable sessions if session tracking is disbled', async () => {
        const sessionReplay = new SessionReplayPlugin({ forceSessionTracking: false });
        await sessionReplay.setup(
          {
            ...mockConfig,
            defaultTracking: false,
          },
          mockAmplitude,
        );
        expect(sessionReplay.config.defaultTracking).toEqual(false);
      });

      test('should not modify defaultTracking object to enable sessions if session tracking is disbled', async () => {
        const sessionReplay = new SessionReplayPlugin({ forceSessionTracking: false });
        await sessionReplay.setup(
          {
            ...mockConfig,
            defaultTracking: {
              pageViews: false,
            },
          },
          mockAmplitude,
        );
        expect(sessionReplay.config.defaultTracking).toEqual({
          pageViews: false,
        });
      });
    });

    test('should call initalize on session replay sdk', async () => {
      const sessionReplay = new SessionReplayPlugin({
        sampleRate: 0.4,
        privacyConfig: {
          blockSelector: ['#id'],
        },
      });
      await sessionReplay.setup(mockConfig, mockAmplitude);

      expect(init).toHaveBeenCalledTimes(1);

      expect(init.mock.calls[0][0]).toEqual(mockConfig.apiKey);
      expect(init.mock.calls[0][1]).toEqual({
        deviceId: mockConfig.deviceId,
        flushMaxRetries: mockConfig.flushMaxRetries,
        logLevel: mockConfig.logLevel,
        loggerProvider: mockConfig.loggerProvider,
        optOut: mockConfig.optOut,
        sampleRate: 0.4,
        serverZone: mockConfig.serverZone,
        sessionId: mockConfig.sessionId,
        privacyConfig: {
          blockSelector: ['#id'],
        },
      });
    });
  });

  describe('execute', () => {
    test('should not modify event and return success from DestinationPlugin', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup(mockConfig, mockAmplitude);
      getSessionReplayProperties.mockReturnValueOnce({
        '[Amplitude] Session Recorded': true,
      });
      const event = {
        event_type: 'event_type',
        event_properties: {
          property_a: true,
          property_b: 123,
        },
      };

      const result = await sessionReplay.execute(event);
      expect(result).toEqual({
        code: 200,
        message: 'success',
        event,
      });
    });

    test('should add event property for [Amplitude] Session Replay ID', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup(mockConfig, mockAmplitude);
      getSessionReplayProperties.mockReturnValueOnce({
        '[Amplitude] Session Replay ID': '123',
      });
      const event = {
        event_type: 'event_type',
        event_properties: {
          property_a: true,
          property_b: 123,
        },
        session_id: 123,
      };

      expect(plugins.length).toBe(1);
      expect(plugins[0].name).toBe('@amplitude/plugin-session-replay-enrichment-browser');

      const sessionReplayEnrichmentPlugin = plugins[0] as EnrichmentPlugin;
      await sessionReplayEnrichmentPlugin.setup(mockConfig);
      const enrichedEvent = await sessionReplayEnrichmentPlugin.execute(event);

      expect(enrichedEvent?.event_properties).toEqual({
        property_a: true,
        property_b: 123,
        '[Amplitude] Session Replay ID': '123',
      });
    });

    test('should not add event property for for even with mismatching session id.', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup(mockConfig, mockAmplitude);
      getSessionReplayProperties.mockReturnValueOnce({
        '[Amplitude] Session Replay ID': '123',
      });
      const event = {
        event_type: 'event_type',
        event_properties: {
          property_a: true,
          property_b: 123,
        },
        session_id: 124,
      };

      expect(plugins.length).toBe(1);
      expect(plugins[0].name).toBe('@amplitude/plugin-session-replay-enrichment-browser');

      const sessionReplayEnrichmentPlugin = plugins[0] as EnrichmentPlugin;
      await sessionReplayEnrichmentPlugin.setup(mockConfig);
      const enrichedEvent = await sessionReplayEnrichmentPlugin.execute(event);

      expect(enrichedEvent?.event_properties).toEqual({
        property_a: true,
        property_b: 123,
      });
    });

    test('should update the session id on any event', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup(mockConfig, mockAmplitude);
      const sessionReplayEnrichmentPlugin = plugins[0] as EnrichmentPlugin;
      const updatedConfig: BrowserConfig = { ...mockConfig, sessionId: 456 };
      await sessionReplayEnrichmentPlugin.setup(updatedConfig, mockAmplitude);

      const event = {
        event_type: 'session_start',
        session_id: 456,
      };
      await sessionReplayEnrichmentPlugin.execute(event);
      expect(setSessionId).toHaveBeenCalledTimes(1);
      expect(setSessionId).toHaveBeenCalledWith(456);
    });
  });

  describe('flush', () => {
    test('should call session replay flush', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup(mockConfig, mockAmplitude);
      await sessionReplay.flush?.();
      expect(flush).toHaveBeenCalled();
    });
  });

  describe('teardown', () => {
    test('should call session replay teardown', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup(mockConfig, mockAmplitude);
      await sessionReplay.teardown?.();
      expect(shutdown).toHaveBeenCalled();
    });
    test('should remove session replay enrichment plugin', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup(mockConfig, mockAmplitude);
      expect(plugins.length).toBe(1);
      expect(plugins[0].name).toBe('@amplitude/plugin-session-replay-enrichment-browser');
      await sessionReplay.teardown?.();
      expect(plugins.length).toBe(0);
      expect(shutdown).toHaveBeenCalled();
    });
  });

  describe('getSessionReplayProperties', () => {
    test('should return session replay properties', async () => {
      const sessionReplay = sessionReplayPlugin() as SessionReplayPlugin;
      await sessionReplay.setup(mockConfig, mockAmplitude);
      getSessionReplayProperties.mockReturnValueOnce({
        '[Amplitude] Session Recorded': true,
        '[Amplitude] Session Replay ID': '123/456',
      });
      const sessionReplayProperties = sessionReplay.getSessionReplayProperties();
      expect(sessionReplayProperties).toEqual({
        '[Amplitude] Session Recorded': true,
        '[Amplitude] Session Replay ID': '123/456',
      });
    });
  });
});
