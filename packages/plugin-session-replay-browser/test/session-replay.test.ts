import { BrowserClient, BrowserConfig, LogLevel, Logger, Plugin, SpecialEventType } from '@amplitude/analytics-types';
import * as sessionReplayBrowser from '@amplitude/session-replay-browser';
import { SessionReplayPlugin, sessionReplayPlugin } from '../src/session-replay';
import { VERSION } from '../src/version';
import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';

jest.mock('@amplitude/session-replay-browser');
type MockedSessionReplayBrowser = jest.Mocked<typeof import('@amplitude/session-replay-browser')>;

type MockedLogger = jest.Mocked<Logger>;

type MockedBrowserClient = jest.Mocked<BrowserClient>;

describe('SessionReplayPlugin', () => {
  const { init, setSessionId, getSessionReplayProperties, evaluateTargetingAndCapture, shutdown, getSessionId } =
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
    setSessionId.mockReturnValue({
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
    test('should setup plugin', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup(mockConfig);
      expect(sessionReplay.config.serverUrl).toBe('url');
      expect(sessionReplay.config.flushMaxRetries).toBe(1);
      expect(sessionReplay.config.flushQueueSize).toBe(0);
      expect(sessionReplay.config.flushIntervalMillis).toBe(0);
    });

    test('should pass user properties to plugin', async () => {
      const updatedConfig: BrowserConfig = { ...mockConfig, sessionId: 456, instanceName: 'browser-sdk' };

      const mockUserProperties = {
        plan_id: 'free',
      };
      jest.spyOn(AnalyticsClientCommon, 'getAnalyticsConnector').mockReturnValue({
        identityStore: {
          getIdentity: () => {
            return {
              userProperties: mockUserProperties,
            };
          },
        },
      } as unknown as ReturnType<typeof AnalyticsClientCommon.getAnalyticsConnector>);
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup(updatedConfig);
      expect(init).toHaveBeenCalledTimes(1);
      expect(init).toHaveBeenCalledWith(
        mockConfig.apiKey,
        expect.objectContaining({ userProperties: mockUserProperties }),
      );
    });

    describe('defaultTracking', () => {
      test('should not change defaultTracking if its set to true', async () => {
        const sessionReplay = new SessionReplayPlugin();
        await sessionReplay.setup({
          ...mockConfig,
          defaultTracking: true,
        });
        expect(sessionReplay.config.defaultTracking).toBe(true);
      });

      test('should modify defaultTracking to enable sessions if its set to false', async () => {
        const sessionReplay = new SessionReplayPlugin();
        await sessionReplay.setup({
          ...mockConfig,
          defaultTracking: false,
        });
        expect(sessionReplay.config.defaultTracking).toEqual({
          pageViews: false,
          formInteractions: false,
          fileDownloads: false,
          sessions: true,
        });
      });

      test('should modify defaultTracking to enable sessions if it is an object', async () => {
        const sessionReplay = new SessionReplayPlugin();
        await sessionReplay.setup({
          ...mockConfig,
          defaultTracking: {
            pageViews: false,
          },
        });
        expect(sessionReplay.config.defaultTracking).toEqual({
          pageViews: false,
          sessions: true,
        });
      });

      test('should not modify defaultTracking to enable sessions if session tracking is disbled', async () => {
        const sessionReplay = new SessionReplayPlugin({ forceSessionTracking: false });
        await sessionReplay.setup({
          ...mockConfig,
          defaultTracking: false,
        });
        expect(sessionReplay.config.defaultTracking).toEqual(false);
      });

      test('should not modify defaultTracking object to enable sessions if session tracking is disbled', async () => {
        const sessionReplay = new SessionReplayPlugin({ forceSessionTracking: false });
        await sessionReplay.setup({
          ...mockConfig,
          defaultTracking: {
            pageViews: false,
          },
        });
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
      await sessionReplay.setup(mockConfig);

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
        version: {
          type: 'plugin',
          version: VERSION,
        },
        userProperties: {},
      });
    });
  });

  describe('execute', () => {
    test('should add event property for [Amplitude] Session Replay ID', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup({ ...mockConfig });
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

      const enrichedEvent = await sessionReplay.execute(event);
      expect(enrichedEvent?.event_properties).toEqual({
        property_a: true,
        property_b: 123,
        '[Amplitude] Session Replay ID': '123',
      });
    });

    test('should evaluate targeting, passing the event', async () => {
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

      await sessionReplay.execute(event);

      expect(evaluateTargetingAndCapture).toHaveBeenCalledWith({
        event: event,
        userProperties: undefined,
      });
    });

    test('should parse user properties for identify event', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup(mockConfig, mockAmplitude);
      getSessionReplayProperties.mockReturnValueOnce({
        '[Amplitude] Session Replay ID': '123',
      });
      const event = {
        event_type: SpecialEventType.IDENTIFY,
        user_properties: {
          $set: {
            plan_id: 'free',
          },
        },
        session_id: 123,
      };

      await sessionReplay.execute(event);

      expect(evaluateTargetingAndCapture).toHaveBeenCalledWith({
        event: event,
        userProperties: {
          plan_id: 'free',
        },
      });
    });

    test('should not add event property for for event with mismatching session id.', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup({ ...mockConfig });
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
      const enrichedEvent = await sessionReplay.execute(event);

      expect(enrichedEvent?.event_properties).toEqual({
        property_a: true,
        property_b: 123,
      });
    });

    test('should update the session id on any event', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup({ ...mockConfig, sessionId: 123 });

      const newEvent = {
        event_type: 'session_start',
      };
      sessionReplay.config.sessionId = 456;
      await sessionReplay.execute(newEvent);
      expect(setSessionId).toHaveBeenCalledTimes(1);
      expect(setSessionId).toHaveBeenCalledWith(456, '1a2b3c', { userProperties: {} });
    });

    test('should update the session id on any event and pass along user properties', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup(mockConfig);

      const event = {
        event_type: 'session_start',
        session_id: 456,
      };
      const mockUserProperties = {
        plan_id: 'free',
      };
      jest.spyOn(AnalyticsClientCommon, 'getAnalyticsConnector').mockReturnValue({
        identityStore: {
          getIdentity: () => {
            return {
              userProperties: mockUserProperties,
            };
          },
        },
      } as unknown as ReturnType<typeof AnalyticsClientCommon.getAnalyticsConnector>);
      sessionReplay.config.sessionId = 456;
      await sessionReplay.execute(event);
      expect(setSessionId).toHaveBeenCalledTimes(1);
      expect(setSessionId).toHaveBeenCalledWith(456, '1a2b3c', { userProperties: mockUserProperties });
    });
    test('should update the session id on any event and pass along empty obj for user properties', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup(mockConfig);

      const event = {
        event_type: 'session_start',
        session_id: 456,
      };
      jest.spyOn(AnalyticsClientCommon, 'getAnalyticsConnector').mockReturnValue({
        identityStore: {
          getIdentity: () => {
            return {
              userProperties: undefined,
            };
          },
        },
      } as unknown as ReturnType<typeof AnalyticsClientCommon.getAnalyticsConnector>);
      sessionReplay.config.sessionId = 456;
      await sessionReplay.execute(event);
      expect(setSessionId).toHaveBeenCalledTimes(1);
      expect(setSessionId).toHaveBeenCalledWith(456, '1a2b3c', { userProperties: {} });
    });

    test('should not update if session id unchanged', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup({ ...mockConfig, sessionId: 123 });
      getSessionId.mockReturnValueOnce(123);

      const event = {
        event_type: 'page view',
        session_id: 123,
      };
      await sessionReplay.execute(event);
      expect(setSessionId).not.toHaveBeenCalled();
    });
  });

  describe('teardown', () => {
    test('should call session replay teardown', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup(mockConfig);
      await sessionReplay.teardown?.();
      expect(shutdown).toHaveBeenCalled();
    });
  });

  describe('getSessionReplayProperties', () => {
    test('should return session replay properties', async () => {
      const sessionReplay = sessionReplayPlugin() as SessionReplayPlugin;
      await sessionReplay.setup(mockConfig);
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
