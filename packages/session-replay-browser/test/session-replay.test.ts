import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';
import { LogLevel, Logger, ServerZone } from '@amplitude/analytics-types';
import * as RRWeb from '@amplitude/rrweb';
import { DEFAULT_SAMPLE_RATE } from '../src/constants';
import * as Helpers from '../src/helpers';
import { SessionReplay } from '../src/session-replay';
import { SessionReplayConfig, SessionReplayOptions } from '../src/typings/session-replay';

jest.mock('@amplitude/rrweb');
type MockedRRWeb = jest.Mocked<typeof import('@amplitude/rrweb')>;

type MockedLogger = jest.Mocked<Logger>;

const mockEvent = {
  type: 4,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};
const mockEventString = JSON.stringify(mockEvent);

describe('SessionReplayPlugin', () => {
  const { record } = RRWeb as MockedRRWeb;
  let originalFetch: typeof global.fetch;
  let globalSpy: jest.SpyInstance;
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  const addEventListenerMock = jest.fn() as jest.Mock<typeof window.addEventListener>;
  const removeEventListenerMock = jest.fn() as jest.Mock<typeof window.removeEventListener>;
  const mockGlobalScope = {
    addEventListener: addEventListenerMock,
    removeEventListener: removeEventListenerMock,
    document: {
      hasFocus: () => true,
    },
  } as unknown as typeof globalThis;
  const apiKey = 'static_key';
  const mockOptions: SessionReplayOptions = {
    flushIntervalMillis: 0,
    flushMaxRetries: 1,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: mockLoggerProvider,
    deviceId: '1a2b3c',
    optOut: false,
    sampleRate: 1,
    sessionId: 123,
    serverZone: ServerZone.EU,
    privacyConfig: {
      blockSelector: '.className',
    },
  };
  const mockEmptyOptions: SessionReplayOptions = {
    flushIntervalMillis: 0,
    flushMaxRetries: 1,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: mockLoggerProvider,
    deviceId: '1a2b3c',
    sessionId: 123,
  };
  beforeEach(() => {
    jest.useFakeTimers();
    originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 200,
      }),
    ) as jest.Mock;
    globalSpy = jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue(mockGlobalScope);
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.spyOn(global.Math, 'random').mockRestore();
    global.fetch = originalFetch;
    jest.useRealTimers();
  });
  describe('init', () => {
    test('should setup plugin', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.5 }).promise;
      expect(sessionReplay.config?.transportProvider).toBeDefined();
      expect(sessionReplay.config?.flushMaxRetries).toBe(1);
      expect(sessionReplay.config?.optOut).toBe(false);
      expect(sessionReplay.config?.sampleRate).toBe(0.5);
      expect(sessionReplay.identifiers?.deviceId).toBe('1a2b3c');
      expect(sessionReplay.identifiers?.sessionId).toBe(123);
      expect(sessionReplay.config?.logLevel).toBe(0);
      expect(sessionReplay.loggerProvider).toBeDefined();
    });

    test('should setup plugin with privacy config', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, {
        ...mockOptions,
        sampleRate: 0.5,
        privacyConfig: { blockSelector: ['.class', '#id'] },
      }).promise;
      expect(sessionReplay.config?.transportProvider).toBeDefined();
      expect(sessionReplay.config?.flushMaxRetries).toBe(1);
      expect(sessionReplay.config?.optOut).toBe(false);
      expect(sessionReplay.config?.sampleRate).toBe(0.5);
      expect(sessionReplay.identifiers?.deviceId).toBe('1a2b3c');
      expect(sessionReplay.identifiers?.sessionId).toBe(123);
      expect(sessionReplay.config?.logLevel).toBe(0);
      expect(sessionReplay.config?.privacyConfig?.blockSelector).toEqual(['.class', '#id']);
      expect(sessionReplay.loggerProvider).toBeDefined();
    });

    test('should call initalize with shouldSendStoredEvents=true', async () => {
      const sessionReplay = new SessionReplay();
      const initalize = jest.spyOn(sessionReplay, 'initialize').mockReturnValueOnce(Promise.resolve());
      await sessionReplay.init(apiKey, mockOptions).promise;

      expect(initalize).toHaveBeenCalledTimes(1);

      expect(initalize.mock.calls[0]).toEqual([true]);
    });
    test('should set up blur and focus event listeners', async () => {
      const sessionReplay = new SessionReplay();
      const stopRecordingMock = jest.fn();
      sessionReplay.recordCancelCallback = stopRecordingMock;
      const initialize = jest.spyOn(sessionReplay, 'initialize').mockReturnValueOnce(Promise.resolve());
      await sessionReplay.init(apiKey, mockOptions).promise;
      initialize.mockReset();
      expect(addEventListenerMock).toHaveBeenCalledTimes(2);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(addEventListenerMock.mock.calls[0][0]).toEqual('blur');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const blurCallback = addEventListenerMock.mock.calls[0][1];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      blurCallback();
      expect(stopRecordingMock).toHaveBeenCalled();
      expect(sessionReplay.recordCancelCallback).toEqual(null);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(addEventListenerMock.mock.calls[1][0]).toEqual('focus');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const focusCallback = addEventListenerMock.mock.calls[1][1];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      focusCallback();
      expect(initialize).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(initialize.mock.calls[0]).toEqual([]);
    });
    test('it should not call initialize if the document does not have focus', () => {
      const sessionReplay = new SessionReplay();
      const initialize = jest.spyOn(sessionReplay, 'initialize').mockReturnValueOnce(Promise.resolve());
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue({
        document: {
          hasFocus: () => false,
        },
      } as typeof globalThis);
      expect(initialize).not.toHaveBeenCalled();
    });

    describe('flushMaxRetries config', () => {
      test('should use default config value if no max retries', async () => {
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: undefined }).promise;

        expect(sessionReplay.config?.flushMaxRetries).toBe(2);
      });
      test('should cap max retries at default config value', async () => {
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 10 }).promise;

        expect(sessionReplay.config?.flushMaxRetries).toBe(2);
      });
      test('should allow a lower value than default config value', async () => {
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 0 }).promise;

        expect(sessionReplay.config?.flushMaxRetries).toBe(0);
      });
    });
  });

  describe('setSessionId', () => {
    test('should return early if config not set', () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.loggerProvider = mockLoggerProvider;
      const stopRecordingMock = jest.fn();

      sessionReplay.setSessionId(456);
      expect(stopRecordingMock).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalled();
    });

    test('should stop recording events for current session', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const stopRecordingMock = jest.fn();

      // Mock class as if it has already been recording events
      sessionReplay.stopRecordingAndSendEvents = stopRecordingMock;

      sessionReplay.setSessionId(456);
      expect(stopRecordingMock).toHaveBeenCalled();
    });

    test('should update the session id, reset events and current sequence id, and start recording', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      expect(sessionReplay.identifiers?.sessionId).toEqual(123);
      expect(sessionReplay.identifiers?.sessionReplayId).toEqual('1a2b3c/123');
      const stopRecordingMock = jest.fn();
      if (!sessionReplay.eventsManager) {
        return;
      }
      const resetSequenceSpy = jest.spyOn(sessionReplay.eventsManager, 'resetSequence');

      // Mock class as if it has already been recording events
      sessionReplay.stopRecordingAndSendEvents = stopRecordingMock;

      sessionReplay.setSessionId(456);
      expect(stopRecordingMock).toHaveBeenCalled();
      expect(sessionReplay.identifiers?.sessionId).toEqual(456);
      expect(sessionReplay.identifiers?.sessionReplayId).toEqual('1a2b3c/456');
      expect(resetSequenceSpy).toHaveBeenCalled();
    });

    test('should return early if no session id, device id is set', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, deviceId: undefined }).promise;
      sessionReplay.loggerProvider = mockLoggerProvider;
      const stopRecordingMock = jest.fn();

      sessionReplay.setSessionId(123);
      expect(stopRecordingMock).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalled();
    });

    test('should update the device id if passed', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.loggerProvider = mockLoggerProvider;

      sessionReplay.setSessionId(456, '9l8m7n');
      expect(sessionReplay.identifiers?.sessionId).toEqual(456);
      expect(sessionReplay.identifiers?.sessionReplayId).toEqual('9l8m7n/456');
      expect(sessionReplay.identifiers?.deviceId).toEqual('9l8m7n');
      expect(sessionReplay.getDeviceId()).toEqual('9l8m7n');
    });
  });

  describe('getSessionId', () => {
    test('should update session id', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const stopRecordingMock = jest.fn();
      expect(sessionReplay.getSessionId()).toEqual(mockOptions.sessionId);

      // Mock class as if it has already been recording events
      sessionReplay.stopRecordingAndSendEvents = stopRecordingMock;

      sessionReplay.setSessionId(456);
      expect(stopRecordingMock).toHaveBeenCalled();
      expect(sessionReplay.getSessionId()).toEqual(456);
    });

    test('should return null if not initialized', () => {
      const sessionReplay = new SessionReplay();
      expect(sessionReplay.getSessionId()).toBeUndefined();
    });

    test('should return early if no session id, device id is set', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, deviceId: undefined }).promise;
      sessionReplay.loggerProvider = mockLoggerProvider;
      const stopRecordingMock = jest.fn();

      sessionReplay.setSessionId(123);
      expect(stopRecordingMock).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalled();
    });
  });

  describe('getSessionReplayProperties', () => {
    test('should return an empty object if config not set', () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.loggerProvider = mockLoggerProvider;

      const result = sessionReplay.getSessionReplayProperties();
      expect(result).toEqual({});
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalled();
    });

    test('should return an empty object if shouldRecord is false', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.getShouldRecord = () => false;

      const result = sessionReplay.getSessionReplayProperties();
      expect(result).toEqual({});
    });

    test('should return the session recorded property if shouldRecord is true', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.getShouldRecord = () => true;

      const result = sessionReplay.getSessionReplayProperties();
      expect(result).toEqual({
        '[Amplitude] Session Replay ID': '1a2b3c/123',
      });
    });

    test('should ignore focus handler when debug mode is on.', async () => {
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue({
        ...mockGlobalScope,
        document: {
          hasFocus: () => false,
        },
      } as typeof globalThis);
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, debugMode: true }).promise;
      const result = sessionReplay.getSessionReplayProperties();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(result).toEqual({
        '[Amplitude] Session Replay ID': '1a2b3c/123',
        '[Amplitude] Session Replay Debug': '{"appHash":"-109988594"}',
      });
    });

    test('should return session replay id property with null', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions }).promise;
      sessionReplay.getShouldRecord = () => true;
      if (sessionReplay.identifiers) {
        sessionReplay.identifiers.sessionReplayId = undefined;
      }

      const result = sessionReplay.getSessionReplayProperties();
      expect(result).toEqual({
        '[Amplitude] Session Replay ID': null,
      });
    });

    test('should return debug property', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, debugMode: true }).promise;
      sessionReplay.getShouldRecord = () => true;

      const result = sessionReplay.getSessionReplayProperties();
      expect(result).toEqual({
        '[Amplitude] Session Replay ID': '1a2b3c/123',
        '[Amplitude] Session Replay Debug': '{"appHash":"-109988594"}',
      });
    });
  });

  describe('initalize', () => {
    test('should return early if session id not set', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sessionId: undefined }).promise;
      if (!sessionReplay.eventsManager) {
        return;
      }
      const eventsManagerInitSpy = jest.spyOn(sessionReplay.eventsManager, 'initialize').mockResolvedValueOnce();
      await sessionReplay.initialize();
      expect(eventsManagerInitSpy).not.toHaveBeenCalled();
    });
    test('should return early if no identifiers', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sessionId: undefined }).promise;
      sessionReplay.identifiers = undefined;
      if (!sessionReplay.eventsManager) {
        return;
      }
      const eventsManagerInitSpy = jest.spyOn(sessionReplay.eventsManager, 'initialize').mockResolvedValueOnce();
      await sessionReplay.initialize();
      expect(eventsManagerInitSpy).not.toHaveBeenCalled();
    });
    test('should initialize eventsManager and record events', async () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.config = {
        apiKey,
        ...mockOptions,
        privacyConfig: { blockSelector: ['#id'] },
      } as SessionReplayConfig;
      sessionReplay.identifiers = {
        sessionId: mockOptions.sessionId,
        deviceId: mockOptions.deviceId,
        sessionReplayId: `${mockOptions.deviceId || 0}/${mockOptions.sessionId || 0}`,
      };
      if (!sessionReplay.eventsManager) {
        return;
      }
      const eventsManagerInitSpy = jest.spyOn(sessionReplay.eventsManager, 'initialize').mockResolvedValueOnce();

      await sessionReplay.initialize();
      expect(eventsManagerInitSpy).toHaveBeenCalledWith({
        sessionId: mockOptions.sessionId,
        deviceId: mockOptions.deviceId,
        shouldSendStoredEvents: false,
      });
      expect(record).toHaveBeenCalledTimes(1);
    });
    test('should initialize eventsManager with shouldSendStoredEvents=true', async () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.config = {
        apiKey,
        ...mockOptions,
        privacyConfig: { blockSelector: ['#id'] },
      } as SessionReplayConfig;
      sessionReplay.identifiers = {
        sessionId: mockOptions.sessionId,
        deviceId: mockOptions.deviceId,
        sessionReplayId: `${mockOptions.deviceId || 0}/${mockOptions.sessionId || 0}`,
      };
      if (!sessionReplay.eventsManager) {
        return;
      }
      const eventsManagerInitSpy = jest.spyOn(sessionReplay.eventsManager, 'initialize').mockResolvedValueOnce();

      await sessionReplay.initialize(true);
      expect(eventsManagerInitSpy).toHaveBeenCalledWith({
        sessionId: mockOptions.sessionId,
        deviceId: mockOptions.deviceId,
        shouldSendStoredEvents: true,
      });
      expect(record).toHaveBeenCalledTimes(1);
    });
    test('should evaluate targeting based on existing user properties', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance' }).promise;
      const mockUserProperties = {
        country: 'US',
        city: 'San Francisco',
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
      const evaluateTargetingSpy = jest.spyOn(sessionReplay, 'evaluateTargeting').mockResolvedValueOnce();

      await sessionReplay.initialize(true);
      expect(evaluateTargetingSpy).toHaveBeenCalledWith({
        userProperties: mockUserProperties,
      });
    });
    test('should evaluate pass nothing to evaluate targeting if config not set', async () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.identifiers = {
        sessionId: mockOptions.sessionId,
        deviceId: mockOptions.deviceId,
        sessionReplayId: `${mockOptions.deviceId || 0}/${mockOptions.sessionId || 0}`,
      };
      sessionReplay.config = undefined;
      const evaluateTargetingSpy = jest.spyOn(sessionReplay, 'evaluateTargeting').mockResolvedValueOnce();

      await sessionReplay.initialize(true);
      expect(evaluateTargetingSpy).toHaveBeenCalledWith({});
    });
  });

  describe('shouldOptOut', () => {
    test('should return undefined if no config set', () => {
      const sessionReplay = new SessionReplay();
      expect(sessionReplay.shouldOptOut()).toEqual(undefined);
    });
    test('should return opt out from identity store if set', async () => {
      jest.spyOn(AnalyticsClientCommon, 'getAnalyticsConnector').mockReturnValue({
        identityStore: {
          getIdentity: () => {
            return {
              optOut: true,
            };
          },
        },
      } as unknown as ReturnType<typeof AnalyticsClientCommon.getAnalyticsConnector>);
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance' }).promise;
      expect(sessionReplay.shouldOptOut()).toEqual(true);
    });
    test('should return opt out from identity store even if set to false', async () => {
      jest.spyOn(AnalyticsClientCommon, 'getAnalyticsConnector').mockReturnValue({
        identityStore: {
          getIdentity: () => {
            return {
              optOut: false,
            };
          },
        },
      } as unknown as ReturnType<typeof AnalyticsClientCommon.getAnalyticsConnector>);
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance', optOut: true }).promise;
      expect(sessionReplay.shouldOptOut()).toEqual(false);
    });
    test('should return config device id if set', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance', optOut: true }).promise;
      expect(sessionReplay.shouldOptOut()).toEqual(true);
    });
  });

  describe('getShouldRecord', () => {
    test('should return true if there are options', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const sampleRate = sessionReplay.config?.sampleRate;
      expect(sampleRate).toBe(mockOptions.sampleRate);
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(true);
    });
    test('should return false if no options', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockEmptyOptions).promise;
      const sampleRate = sessionReplay.config?.sampleRate;
      expect(sampleRate).toBe(DEFAULT_SAMPLE_RATE);
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('should return false if session not included in sample rate', async () => {
      jest.spyOn(Helpers, 'isSessionInSample').mockImplementationOnce(() => false);

      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.2 }).promise;
      const sampleRate = sessionReplay.config?.sampleRate;
      expect(sampleRate).toBe(0.2);
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('should set record as true if session is included in sample rate', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.2 }).promise;
      jest.spyOn(Helpers, 'isSessionInSample').mockImplementationOnce(() => true);
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(true);
    });
    test('should set record as false if opt out in config', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, optOut: true }).promise;
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('should set record as false if no session id', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sessionId: undefined }).promise;
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('opt out in config should override the sample rate', async () => {
      jest.spyOn(Math, 'random').mockImplementationOnce(() => 0.7);
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.8, optOut: true }).promise;
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('should return false if document does not have focus and log', async () => {
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue({
        ...mockGlobalScope,
        document: {
          hasFocus: () => false,
        },
      } as typeof globalThis);
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const shouldRecord = sessionReplay.getShouldRecord();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.log).toHaveBeenCalled();
      expect(shouldRecord).toBe(false);
    });
    test('should return false if  no config', async () => {
      const sessionReplay = new SessionReplay();
      const shouldRecord = sessionReplay.getShouldRecord();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).not.toHaveBeenCalled();
      expect(shouldRecord).toBe(false);
    });
  });

  describe('stopRecordingAndSendEvents', () => {
    test('it should catch errors as warnings', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const mockStopRecordingEvents = jest.fn().mockImplementation(() => {
        throw new Error('test error');
      });
      sessionReplay.recordCancelCallback = mockStopRecordingEvents;
      sessionReplay.stopRecordingAndSendEvents();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });
    test('it should send events for passed session', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const sendEventsMock = jest.fn();
      if (!sessionReplay.eventsManager) {
        return;
      }
      sessionReplay.eventsManager.sendEvents = sendEventsMock;
      sessionReplay.stopRecordingAndSendEvents(123);
      expect(sendEventsMock).toHaveBeenCalledWith({
        sessionId: 123,
        deviceId: '1a2b3c',
      });
    });
    test('it should send events for config session if none passed', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const sendEventsMock = jest.fn();
      if (!sessionReplay.eventsManager) {
        return;
      }
      sessionReplay.eventsManager.sendEvents = sendEventsMock;
      sessionReplay.stopRecordingAndSendEvents();
      expect(sendEventsMock).toHaveBeenCalledWith({
        sessionId: 123,
        deviceId: '1a2b3c',
      });
    });
    test('it should not send if no config', async () => {
      const sessionReplay = new SessionReplay();
      const sendEventsMock = jest.fn();
      if (!sessionReplay.eventsManager) {
        return;
      }
      sessionReplay.eventsManager.sendEvents = sendEventsMock;
      sessionReplay.stopRecordingAndSendEvents();
      expect(sendEventsMock).not.toHaveBeenCalled();
    });
    test('it should not send if no identifiers', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.identifiers = undefined;
      const sendEventsMock = jest.fn();
      if (!sessionReplay.eventsManager) {
        return;
      }
      sessionReplay.eventsManager.sendEvents = sendEventsMock;
      sessionReplay.stopRecordingAndSendEvents();
      expect(sendEventsMock).not.toHaveBeenCalled();
    });
  });

  describe('recordEvents', () => {
    test('should return early if no config', () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.recordEvents();
      expect(record).not.toHaveBeenCalled();
      if (!sessionReplay.eventsManager) {
        return;
      }
      expect(sessionReplay.eventsManager.events).toEqual([]);
    });

    test('should return early if user opts out', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, optOut: true, privacyConfig: { blockSelector: ['#class'] } })
        .promise;
      sessionReplay.recordEvents();
      expect(record).not.toHaveBeenCalled();
      if (!sessionReplay.eventsManager) {
        return;
      }
      expect(sessionReplay.eventsManager.events).toEqual([]);
    });

    test('should addEvent to eventManager', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.recordEvents();
      if (!sessionReplay.eventsManager) {
        return;
      }
      const addEventSpy = jest.spyOn(sessionReplay.eventsManager, 'addEvent');
      expect(sessionReplay.eventsManager.events).toEqual([]);
      const recordArg = record.mock.calls[0][0];
      // Emit event, which is stored in class and IDB
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(addEventSpy).toHaveBeenCalledTimes(1);
      expect(addEventSpy).toHaveBeenCalledWith({
        event: mockEventString,
        sessionId: mockOptions.sessionId,
        deviceId: mockOptions.deviceId,
      });
    });

    test('should stop recording before starting anew', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const stopRecordingMock = jest.fn();
      sessionReplay.recordCancelCallback = stopRecordingMock;
      sessionReplay.recordEvents();
      expect(stopRecordingMock).toHaveBeenCalled();
    });

    test('should stop recording and send events if document is not in focus', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.recordEvents();
      const stopRecordingMock = jest.fn();
      sessionReplay.recordCancelCallback = stopRecordingMock;
      if (!sessionReplay.eventsManager) {
        return;
      }
      expect(sessionReplay.eventsManager.events).toEqual([]);
      sessionReplay.eventsManager.events = [mockEventString]; // Add one event to list to trigger sending in stopRecordingAndSendEvents
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue({
        document: {
          hasFocus: () => false,
        },
      } as typeof globalThis);
      const sendEventsMock = jest
        .spyOn(sessionReplay.eventsManager, 'sendEvents')
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .mockImplementationOnce(() => {});
      const recordArg = record.mock.calls[0][0];
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sendEventsMock).toHaveBeenCalledTimes(1);
      expect(sendEventsMock).toHaveBeenCalledWith({
        sessionId: 123,
        deviceId: '1a2b3c',
      });
      expect(stopRecordingMock).toHaveBeenCalled();
      expect(sessionReplay.recordCancelCallback).toEqual(null);
      expect(sessionReplay.eventsManager.events).toEqual([mockEventString]); // events should not change, emmitted event should be ignored
    });

    test('should stop recording and send events if user opts out during recording', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.recordEvents();
      const stopRecordingMock = jest.fn();
      sessionReplay.recordCancelCallback = stopRecordingMock;
      if (!sessionReplay.eventsManager) {
        return;
      }
      expect(sessionReplay.eventsManager.events).toEqual([]);
      sessionReplay.eventsManager.events = [mockEventString]; // Add one event to list to trigger sending in stopRecordingAndSendEvents
      const sendEventsMock = jest
        .spyOn(sessionReplay.eventsManager, 'sendEvents')
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .mockImplementationOnce(() => {});
      sessionReplay.shouldOptOut = () => true;
      const recordArg = record.mock.calls[0][0];
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sendEventsMock).toHaveBeenCalledTimes(1);
      expect(sendEventsMock).toHaveBeenCalledWith({
        sessionId: 123,
        deviceId: '1a2b3c',
      });
      expect(stopRecordingMock).toHaveBeenCalled();
      expect(sessionReplay.recordCancelCallback).toEqual(null);
      expect(sessionReplay.eventsManager.events).toEqual([mockEventString]); // events should not change, emmitted event should be ignored
    });

    test('should add an error handler', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.recordEvents();
      const recordArg = record.mock.calls[0][0];
      const errorHandlerReturn = recordArg?.errorHandler && recordArg?.errorHandler(new Error('test error'));
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
      expect(errorHandlerReturn).toBe(true);
    });
  });

  describe('evaluateTargeting', () => {
    let sessionReplay: SessionReplay;
    let evaluateTargetingMock: jest.Mock;
    beforeEach(async () => {
      evaluateTargetingMock = jest.fn();
      sessionReplay = new SessionReplay();
      sessionReplay.initialize = jest.fn(); // Mock out the initialize method as it calls evaluateTargeting, creates testing conflicts
      await sessionReplay.init(apiKey, { ...mockOptions }).promise;

      if (!sessionReplay.remoteConfigFetch) {
        throw new Error('no remote config fetch');
      }
      sessionReplay.remoteConfigFetch.evaluateTargeting = evaluateTargetingMock;
    });
    test('should return undefined if no identifiers set', async () => {
      sessionReplay.identifiers = undefined;
      await sessionReplay.evaluateTargeting();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalledWith(
        'Session replay init has not been called, cannot evaluate targeting.',
      );
      expect(evaluateTargetingMock).not.toHaveBeenCalled();
    });

    test('should pass identifiers and user properties to evaluateTargeting', async () => {
      const mockUserProperties = {
        country: 'US',
        city: 'San Francisco',
      };
      await sessionReplay.evaluateTargeting({ userProperties: mockUserProperties });
      expect(evaluateTargetingMock).toHaveBeenCalledWith({
        sessionId: mockOptions.sessionId,
        deviceId: mockOptions.deviceId,
        userProperties: mockUserProperties,
      });
    });
  });

  describe('getDeviceId', () => {
    test('should return undefined if no config set', () => {
      const sessionReplay = new SessionReplay();
      expect(sessionReplay.getDeviceId()).toEqual(undefined);
    });
    test('should return device id from identity store if set', async () => {
      const storedDeviceId = '6t7y8u';
      jest.spyOn(AnalyticsClientCommon, 'getAnalyticsConnector').mockReturnValue({
        identityStore: {
          getIdentity: () => {
            return {
              deviceId: storedDeviceId,
            };
          },
        },
      } as unknown as ReturnType<typeof AnalyticsClientCommon.getAnalyticsConnector>);
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance' }).promise;
      expect(sessionReplay.getDeviceId()).toEqual(storedDeviceId);
    });
    test('should return config device id if set', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, instanceName: 'my_instance' }).promise;
      expect(sessionReplay.getDeviceId()).toEqual(mockOptions.deviceId);
    });
  });

  describe('flush', () => {
    test('should call track destination flush with useRetry as true', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      if (!sessionReplay.eventsManager) {
        return;
      }
      const flushMock = jest.spyOn(sessionReplay.eventsManager, 'flush');

      await sessionReplay.flush(true);
      expect(flushMock).toHaveBeenCalled();
      expect(flushMock).toHaveBeenCalledWith(true);
    });
    test('should call track destination flush without useRetry', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;

      if (!sessionReplay.eventsManager) {
        return;
      }
      const flushMock = jest.spyOn(sessionReplay.eventsManager, 'flush');
      await sessionReplay.flush();
      expect(flushMock).toHaveBeenCalled();
      expect(flushMock).toHaveBeenCalledWith(false);
    });
  });

  describe('shutdown', () => {
    test('should remove event listeners', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      removeEventListenerMock.mockReset();
      sessionReplay.shutdown();
      expect(removeEventListenerMock).toHaveBeenCalledTimes(2);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(removeEventListenerMock.mock.calls[0][0]).toEqual('blur');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(removeEventListenerMock.mock.calls[1][0]).toEqual('focus');
    });

    test('should stop recording and send any events in queue', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const stopRecordingMock = jest.fn();
      sessionReplay.recordCancelCallback = stopRecordingMock;
      if (!sessionReplay.eventsManager) {
        return;
      }
      sessionReplay.eventsManager.events = [mockEventString];
      const sendEventsMock = jest
        .spyOn(sessionReplay.eventsManager, 'sendEvents')
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .mockImplementationOnce(() => {});
      sessionReplay.shutdown();
      expect(stopRecordingMock).toHaveBeenCalled();
      expect(sessionReplay.recordCancelCallback).toBe(null);
      expect(sendEventsMock).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(sendEventsMock.mock.calls[0][0]).toEqual({
        sessionId: 123,
        deviceId: '1a2b3c',
      });
    });
  });

  describe('getCurrentUrl', () => {
    test('returns url if exists', () => {
      globalSpy.mockImplementation(() => ({
        location: {
          href: 'https://www.amplitude.com',
        },
      }));
      const url = Helpers.getCurrentUrl();
      expect(url).toEqual('https://www.amplitude.com');
    });

    test('returns empty string if url does not exist', () => {
      globalSpy.mockImplementation(() => undefined);
      const url = Helpers.getCurrentUrl();
      expect(url).toEqual('');
    });
  });

  describe('getBlockSelectors', () => {
    test('null config', () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.config = undefined;
      expect(sessionReplay.getBlockSelectors()).not.toBeDefined();
    });
    test('null privacy config', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      if (sessionReplay.config) {
        sessionReplay.config.privacyConfig = undefined;
      }
      expect(sessionReplay.getBlockSelectors()).not.toBeDefined();
    });
    test('returns block selectors', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      expect(sessionReplay.getBlockSelectors()).toEqual('.className');
    });
  });

  describe('getSessionReplayDebugPropertyValue', () => {
    test('null config', () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.config = undefined;
      expect(sessionReplay.getSessionReplayDebugPropertyValue()).toBe('{"appHash":""}');
    });
  });
});
