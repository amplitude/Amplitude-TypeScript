import { BrowserConfig, LogLevel, Logger } from '@amplitude/analytics-types';
import * as sessionReplayBrowser from '@amplitude/session-replay-browser';
import { SessionReplayPlugin, sessionReplayPlugin } from '../src/session-replay';

jest.mock('@amplitude/session-replay-browser');
type MockedSessionReplayBrowser = jest.Mocked<typeof import('@amplitude/session-replay-browser')>;

type MockedLogger = jest.Mocked<Logger>;

describe('SessionReplayPlugin', () => {
  const { init, setSessionId, getSessionReplayProperties, shutdown } =
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
  beforeEach(() => {
    init.mockReturnValue({
      promise: Promise.resolve(),
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
    });

    test('should call initalize on session replay sdk', async () => {
      const sessionReplay = new SessionReplayPlugin({
        sampleRate: 0.4,
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
      });
    });
  });

  describe('execute', () => {
    test('should add event property for [Amplitude] Session Recorded', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup(mockConfig);
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

      const enrichedEvent = await sessionReplay.execute(event);
      expect(enrichedEvent?.event_properties).toEqual({
        property_a: true,
        property_b: 123,
        '[Amplitude] Session Recorded': true,
      });
    });

    test('should set the session id on session replay sdk when session_start fires', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup(mockConfig);
      const event = {
        event_type: 'session_start',
        session_id: 456,
      };
      await sessionReplay.execute(event);
      expect(setSessionId).toHaveBeenCalledTimes(1);
      expect(setSessionId).toHaveBeenCalledWith(456);
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
