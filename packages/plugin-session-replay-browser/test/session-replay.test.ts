import { BrowserClient, BrowserConfig, LogLevel, ILogger, Plugin, Event } from '@amplitude/analytics-core';
import * as sessionReplayBrowser from '@amplitude/session-replay-browser';
import { SessionReplayPlugin, sessionReplayPlugin } from '../src/session-replay';
import { VERSION } from '../src/version';
import { randomUUID } from 'crypto';

jest.mock('@amplitude/session-replay-browser');
type MockedSessionReplayBrowser = jest.Mocked<typeof import('@amplitude/session-replay-browser')>;

type MockedLogger = jest.Mocked<ILogger>;

type MockedBrowserClient = jest.Mocked<BrowserClient>;

describe('SessionReplayPlugin', () => {
  const { init, setSessionId, getSessionReplayProperties, shutdown, getSessionId } =
    sessionReplayBrowser as MockedSessionReplayBrowser;
  const mockLoggerProviderDebug = jest.fn();
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: mockLoggerProviderDebug,
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
    getSessionReplayProperties.mockImplementation(() => {
      return { '[Amplitude] Session Replay ID': 'foo/bar' };
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
      const customDeviceId = randomUUID();
      const sessionReplay = new SessionReplayPlugin({
        deviceId: customDeviceId,
      });
      await sessionReplay.setup?.(mockConfig, mockAmplitude);
      expect(sessionReplay.config.serverUrl).toBe('url');
      expect(sessionReplay.config.flushMaxRetries).toBe(1);
      expect(sessionReplay.config.flushQueueSize).toBe(0);
      expect(sessionReplay.config.flushIntervalMillis).toBe(0);

      expect(init).toHaveBeenCalledWith('static_key', expect.objectContaining({ deviceId: customDeviceId }));
    });

    describe('defaultTracking', () => {
      test('should not change defaultTracking forceSessionTracking is not defined', async () => {
        const sessionReplay = new SessionReplayPlugin();
        await sessionReplay.setup?.(
          {
            ...mockConfig,
            defaultTracking: true,
          },
          mockAmplitude,
        );
        expect(sessionReplay.config.defaultTracking).toBe(true);
      });

      test('should not change defaultTracking if its set to true', async () => {
        const sessionReplay = new SessionReplayPlugin({ forceSessionTracking: true });
        await sessionReplay.setup?.(
          {
            ...mockConfig,
            defaultTracking: true,
          },
          mockAmplitude,
        );
        expect(sessionReplay.config.defaultTracking).toBe(true);
      });

      test('should modify defaultTracking to enable sessions if its set to false', async () => {
        const sessionReplay = new SessionReplayPlugin({ forceSessionTracking: true });
        await sessionReplay.setup?.(
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
        const sessionReplay = new SessionReplayPlugin({ forceSessionTracking: true });
        await sessionReplay.setup?.(
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
        await sessionReplay.setup?.(
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
        await sessionReplay.setup?.(
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

    test('should call initialize on session replay sdk', async () => {
      const sessionReplay = new SessionReplayPlugin({
        sampleRate: 0.4,
        privacyConfig: {
          blockSelector: ['#id'],
        },
      });
      await sessionReplay.setup?.(mockConfig, mockAmplitude);

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
      });
    });

    test('should call initialize on session replay sdk with custom server urls', async () => {
      const configServerUrl = 'http://localhost:3000';
      const trackServerUrl = 'http://localhost:3001';

      const sessionReplay = new SessionReplayPlugin({
        sampleRate: 0.4,
        privacyConfig: {
          blockSelector: ['#id'],
        },
        configServerUrl,
        trackServerUrl,
      });
      await sessionReplay.setup?.(mockConfig, mockAmplitude);

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
        configServerUrl,
        trackServerUrl,
        sessionId: mockConfig.sessionId,
        privacyConfig: {
          blockSelector: ['#id'],
        },
        version: {
          type: 'plugin',
          version: VERSION,
        },
      });
    });

    // eslint-disable-next-line jest/expect-expect
    test('should fail gracefully', async () => {
      expect(async () => {
        const sessionReplay = new SessionReplayPlugin();
        init.mockImplementation(() => {
          throw new Error('Mock Error');
        });
        await sessionReplay.setup?.(mockConfig, mockAmplitude);
      }).not.toThrow();
    });
  });

  describe('onSessionIdChanged', () => {
    test('should call setSessionId()', async () => {
      const sessionReplay = sessionReplayPlugin();
      getSessionId.mockReturnValueOnce(123);
      await sessionReplay.setup?.({ ...mockConfig }, mockAmplitude);

      await sessionReplay.onSessionIdChanged?.(456);

      expect(setSessionId).toHaveBeenCalledTimes(1);
      expect(setSessionId).toHaveBeenCalledWith(456);
      expect(mockLoggerProviderDebug).toHaveBeenCalledWith(
        'Analytics session id is changed to 456, SR session id is 123.',
      );
    });
  });

  describe('onOptOutChanged', () => {
    test('should shutdown when optOut is changed to true', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup?.({ ...mockConfig }, mockAmplitude);

      await sessionReplay.onOptOutChanged?.(true);

      expect(shutdown).toHaveBeenCalledTimes(1);
      expect(mockLoggerProviderDebug).toHaveBeenCalledWith(
        'optOut is changed to true, calling sessionReplay.shutdown().',
      );
    });

    test('should re init when optOut is changed to false', async () => {
      const customDeviceId = randomUUID();
      const sessionReplay = new SessionReplayPlugin({
        deviceId: customDeviceId,
      });
      // First init() called
      await sessionReplay.setup?.(mockConfig, mockAmplitude);
      // Second init() called
      await sessionReplay.onOptOutChanged?.(false);

      expect(init).toHaveBeenCalledTimes(2);
      expect(mockLoggerProviderDebug).toHaveBeenCalledWith('optOut is changed to false, calling sessionReplay.init().');
      expect(sessionReplay.config.serverUrl).toBe('url');
      expect(sessionReplay.config.flushMaxRetries).toBe(1);
      expect(sessionReplay.config.flushQueueSize).toBe(0);
      expect(sessionReplay.config.flushIntervalMillis).toBe(0);

      expect(init).toHaveBeenCalledWith('static_key', expect.objectContaining({ deviceId: customDeviceId }));
      expect(init).toHaveBeenNthCalledWith(2, 'static_key', expect.objectContaining({ deviceId: customDeviceId }));
    });
  });

  describe('execute', () => {
    test('should add event property for [Amplitude] Session Replay ID', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup?.({ ...mockConfig }, mockAmplitude);
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

      const enrichedEvent = await sessionReplay.execute?.(event);
      expect(enrichedEvent?.event_properties).toEqual({
        property_a: true,
        property_b: 123,
        '[Amplitude] Session Replay ID': '123',
      });
    });

    test('should not add event property for for event with mismatching session id.', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup?.({ ...mockConfig }, mockAmplitude);
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
      const enrichedEvent = await sessionReplay.execute?.(event);

      expect(enrichedEvent?.event_properties).toEqual({
        property_a: true,
        property_b: 123,
      });
    });

    test('should update the session id on any event', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup?.({ ...mockConfig, sessionId: 123 }, mockAmplitude);

      const newEvent = {
        event_type: 'session_start',
      };
      sessionReplay.config.sessionId = 456;
      await sessionReplay.execute(newEvent);
      expect(setSessionId).toHaveBeenCalledTimes(1);
      expect(setSessionId).toHaveBeenCalledWith(456);
    });

    test('should not update if session id unchanged', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup?.({ ...mockConfig, sessionId: 123 }, mockAmplitude);
      getSessionId.mockReturnValueOnce(123);

      const event = {
        event_type: 'page view',
        session_id: 123,
      };
      await sessionReplay.execute?.(event);
      expect(setSessionId).not.toHaveBeenCalled();
    });

    test('should return original event in case of errors', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup?.({ ...mockConfig }, mockAmplitude);
      getSessionReplayProperties.mockImplementation(() => {
        throw new Error('Mock error');
      });
      const event = {
        event_type: 'event_type',
        event_properties: {
          property_a: true,
          property_b: 123,
        },
        session_id: 123,
      };

      const enrichedEvent = await sessionReplay.execute?.(event);
      expect(enrichedEvent).toEqual(event);
    });
  });

  describe('teardown', () => {
    test('should call session replay teardown', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup?.(mockConfig, mockAmplitude);
      await sessionReplay.teardown?.();
      expect(shutdown).toHaveBeenCalled();
    });

    test('internal errors should not be thrown', async () => {
      expect(async () => {
        const sessionReplay = sessionReplayPlugin();
        await sessionReplay.setup?.(mockConfig, mockAmplitude);

        // Mock the shutdown function to throw an error
        shutdown.mockImplementation(() => {
          throw new Error('Mock shutdown error');
        });
        await sessionReplay.teardown?.();
      }).not.toThrow();
    });

    test('should update the session id on any event when using custom session id', async () => {
      const sessionReplay = sessionReplayPlugin({
        customSessionId: (event: Event) => {
          const event_properties = event.event_properties as { [key: string]: any };
          if (!event_properties) {
            return;
          }
          return event_properties['custom_session_id'] as string | undefined;
        },
      });
      await sessionReplay.setup?.({ ...mockConfig }, mockAmplitude);
      getSessionId.mockReturnValueOnce('test_122');
      const event = {
        event_type: 'event_type',
        event_properties: {
          property_a: true,
          property_b: 123,
          custom_session_id: 'test_123',
        },
        session_id: 124,
      };

      await sessionReplay.execute?.(event);
      expect(setSessionId).toHaveBeenCalledTimes(1);
      expect(setSessionId).toHaveBeenCalledWith('test_123');
    });

    test('should not update the session id when using custom session id and it does not change', async () => {
      const sessionReplay = sessionReplayPlugin({
        customSessionId: (event: Event) => {
          const event_properties = event.event_properties as { [key: string]: any };
          if (!event_properties) {
            return;
          }
          return event_properties['custom_session_id'] as string | undefined;
        },
      });
      await sessionReplay.setup?.({ ...mockConfig }, mockAmplitude);
      getSessionId.mockReturnValueOnce('test_123');
      const event = {
        event_type: 'event_type',
        event_properties: {
          property_a: true,
          property_b: 123,
          custom_session_id: 'test_123',
        },
        session_id: 124,
      };

      await sessionReplay.execute?.(event);
      expect(setSessionId).not.toHaveBeenCalled();
    });

    test('should do nothing when the custom session id cannot be found', async () => {
      const sessionReplay = sessionReplayPlugin({
        customSessionId: (event: Event) => {
          const event_properties = event.event_properties as { [key: string]: any };
          if (!event_properties) {
            return;
          }
          return event_properties['custom_session_id'] as string | undefined;
        },
      });
      await sessionReplay.setup?.({ ...mockConfig }, mockAmplitude);
      const event = {
        event_type: 'event_type',
        event_properties: {
          property_a: true,
          property_b: 123,
        },
        session_id: 124,
      };

      const enrichedEvent = await sessionReplay.execute?.(event);
      expect(setSessionId).not.toHaveBeenCalled();
      expect(enrichedEvent).toEqual(event);
    });
  });

  describe('getSessionReplayProperties', () => {
    test('should return session replay properties', async () => {
      const sessionReplay = sessionReplayPlugin() as SessionReplayPlugin;
      await sessionReplay.setup?.(mockConfig, mockAmplitude);
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
