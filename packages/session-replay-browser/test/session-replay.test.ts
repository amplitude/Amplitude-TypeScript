/* eslint-disable jest/expect-expect */
import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';
import { LogLevel, Logger, ServerZone } from '@amplitude/analytics-types';
import * as RRWeb from '@amplitude/rrweb';
import * as IDBKeyVal from 'idb-keyval';
import { DEFAULT_SAMPLE_RATE, DEFAULT_SESSION_REPLAY_PROPERTY } from '../src/constants';
import * as Helpers from '../src/helpers';
import { UNEXPECTED_ERROR_MESSAGE, getSuccessMessage } from '../src/messages';
import { SessionReplay } from '../src/session-replay';
import { IDBStore, RecordingStatus, SessionReplayConfig, SessionReplayOptions } from '../src/typings/session-replay';

jest.mock('idb-keyval');
type MockedIDBKeyVal = jest.Mocked<typeof import('idb-keyval')>;

jest.mock('@amplitude/rrweb');
type MockedRRWeb = jest.Mocked<typeof import('@amplitude/rrweb')>;

type MockedLogger = jest.Mocked<Logger>;

const mockEvent = {
  type: 4,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};
const mockEventString = JSON.stringify(mockEvent);

async function runScheduleTimers() {
  // exhause first setTimeout
  jest.runAllTimers();
  // wait for next tick to call nested setTimeout
  await Promise.resolve();
  // exhause nested setTimeout
  jest.runAllTimers();
}

describe('SessionReplayPlugin', () => {
  const { get, update } = IDBKeyVal as MockedIDBKeyVal;
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
      expect(sessionReplay.config?.deviceId).toBe('1a2b3c');
      expect(sessionReplay.config?.sessionId).toBe(123);
      expect(sessionReplay.config?.logLevel).toBe(0);
      expect(sessionReplay.loggerProvider).toBeDefined();
      expect(sessionReplay.storageKey).toBe('AMP_replay_unsent_static_key');
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
      expect(sessionReplay.config?.deviceId).toBe('1a2b3c');
      expect(sessionReplay.config?.sessionId).toBe(123);
      expect(sessionReplay.config?.logLevel).toBe(0);
      expect(sessionReplay.config?.privacyConfig?.blockSelector).toEqual(['.class', '#id']);
      expect(sessionReplay.loggerProvider).toBeDefined();
      expect(sessionReplay.storageKey).toBe('AMP_replay_unsent_static_key');
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
      sessionReplay.stopRecordingEvents = stopRecordingMock;
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
      expect(sessionReplay.stopRecordingEvents).toEqual(null);

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
      const stopRecordingMock = jest.fn();

      // Mock class as if it has already been recording events
      sessionReplay.stopRecordingAndSendEvents = stopRecordingMock;
      sessionReplay.events = [mockEventString];
      sessionReplay.currentSequenceId = 4;

      sessionReplay.setSessionId(456);
      expect(stopRecordingMock).toHaveBeenCalled();
      expect(sessionReplay.config?.sessionId).toEqual(456);
      expect(sessionReplay.config?.sessionReplayId).toEqual('1a2b3c/456');
      expect(sessionReplay.events).toEqual([]);
      expect(sessionReplay.currentSequenceId).toEqual(0);
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
      expect(sessionReplay.config?.sessionId).toEqual(456);
      expect(sessionReplay.config?.sessionReplayId).toEqual('9l8m7n/456');
      expect(sessionReplay.config?.deviceId).toEqual('9l8m7n');
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
      if (sessionReplay.config) {
        sessionReplay.config.sessionReplayId = undefined;
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
    test('should read events from storage and send them if shouldSendStoredEvents is true', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sessionId: 456 }).promise;
      const mockGetResolution: Promise<IDBStore> = Promise.resolve({
        123: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        456: {
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      });
      get.mockReturnValueOnce(mockGetResolution);
      const send = jest.spyOn(sessionReplay, 'sendEventsList').mockReturnValueOnce();

      await sessionReplay.initialize(true);
      await mockGetResolution;
      jest.runAllTimers();
      expect(send).toHaveBeenCalledTimes(1);

      // Should send only events from sequences marked as recording and not current session
      expect(send.mock.calls[0][0]).toEqual({
        events: [mockEventString],
        sequenceId: 3,
        sessionId: 123,
      });
    });
    test('should return early if using old format of IDBStore', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sessionId: 456 }).promise;
      const mockGetResolution = Promise.resolve({
        123: {
          events: [mockEventString],
          sequenceId: 1,
        },
        456: {
          events: [mockEventString],
          sequenceId: 1,
        },
      });
      get.mockReturnValueOnce(mockGetResolution);
      const send = jest.spyOn(sessionReplay, 'sendEventsList').mockReturnValueOnce();

      await sessionReplay.initialize(true);
      await mockGetResolution;
      jest.runAllTimers();
      expect(send).toHaveBeenCalledTimes(0);
    });
    test('should return early if session id not set', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sessionId: undefined }).promise;
      const getAllSessionEventsFromStore = jest
        .spyOn(sessionReplay, 'getAllSessionEventsFromStore')
        .mockReturnValueOnce(Promise.resolve({}));
      await sessionReplay.initialize();
      expect(getAllSessionEventsFromStore).not.toHaveBeenCalled();
    });
    test('should return early if no config', async () => {
      const sessionReplay = new SessionReplay();
      const getAllSessionEventsFromStore = jest
        .spyOn(sessionReplay, 'getAllSessionEventsFromStore')
        .mockReturnValueOnce(Promise.resolve({}));
      await sessionReplay.initialize();
      expect(getAllSessionEventsFromStore).not.toHaveBeenCalled();
    });
    test('should return early if stopRecordingEvents is already defined, signaling that recording is already in progress', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      sessionReplay.stopRecordingEvents = () => {};
      const getAllSessionEventsFromStore = jest
        .spyOn(sessionReplay, 'getAllSessionEventsFromStore')
        .mockReturnValueOnce(
          Promise.resolve({
            123: {
              shouldRecord: true,
              currentSequenceId: 3,
              sessionSequences: {
                3: {
                  events: [mockEventString],
                  status: RecordingStatus.RECORDING,
                },
              },
            },
          }),
        );
      await sessionReplay.initialize();
      expect(getAllSessionEventsFromStore).toHaveBeenCalled();
      expect(sessionReplay.events).toEqual([]); // events should not be updated to match what is in the store
    });
    test('should configure current sequence id and events correctly if last sequence was sent', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const mockGetResolution: Promise<IDBStore> = Promise.resolve({
        123: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: RecordingStatus.SENT,
            },
          },
        },
      });
      get.mockReturnValueOnce(mockGetResolution);
      await sessionReplay.initialize();
      expect(sessionReplay.currentSequenceId).toEqual(4);
      expect(sessionReplay.events).toEqual([]);
    });
    test('should configure current sequence id and events correctly if last sequence was recording', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const mockGetResolution: Promise<IDBStore> = Promise.resolve({
        123: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      });
      get.mockReturnValueOnce(mockGetResolution);
      await sessionReplay.initialize();
      expect(sessionReplay.currentSequenceId).toEqual(3);
      expect(sessionReplay.events).toEqual([mockEventString]);
    });
    test('should handle no stored events', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const mockGetResolution = Promise.resolve({});
      get.mockReturnValueOnce(mockGetResolution);
      await sessionReplay.initialize();
      expect(sessionReplay.currentSequenceId).toBe(0);
      expect(sessionReplay.events).toEqual([]);
    });
    test('should handle no stored sequences for session', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const mockGetResolution = Promise.resolve({
        123: {
          currentSequenceId: 0,
          sessionSequences: {},
        },
      });
      get.mockReturnValueOnce(mockGetResolution);
      await sessionReplay.initialize();
      expect(sessionReplay.currentSequenceId).toBe(0);
      expect(sessionReplay.events).toEqual([]);
    });
    test('should record events', async () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.config = {
        apiKey,
        ...mockOptions,
        privacyConfig: { blockSelector: ['#id'] },
      } as SessionReplayConfig;
      const mockGetResolution = Promise.resolve({});
      get.mockReturnValueOnce(mockGetResolution);
      await sessionReplay.initialize();
      expect(record).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendStoredEvents', () => {
    test('should send all recording sequences except the current sequence for the current session', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sessionId: 456 }).promise;
      sessionReplay.currentSequenceId = 3;
      const store: IDBStore = {
        123: {
          currentSequenceId: 5,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
            4: {
              events: [],
              status: RecordingStatus.SENT,
            },
            5: {
              events: [mockEventString, mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        456: {
          currentSequenceId: 3,
          sessionSequences: {
            1: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
            2: {
              events: [],
              status: RecordingStatus.SENT,
            },
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      };
      const sendEventsList = jest.spyOn(sessionReplay, 'sendEventsList');
      sessionReplay.sendStoredEvents(store);
      expect(sendEventsList).toHaveBeenCalledTimes(3);
      expect(sendEventsList.mock.calls[0][0]).toEqual({
        events: [mockEventString],
        sequenceId: 3,
        sessionId: 123,
      });
      expect(sendEventsList.mock.calls[1][0]).toEqual({
        events: [mockEventString, mockEventString],
        sequenceId: 5,
        sessionId: 123,
      });
      expect(sendEventsList.mock.calls[2][0]).toEqual({
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 456,
      });
    });
    test('should handle config not yet set', async () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.currentSequenceId = 3;
      const store: IDBStore = {
        123: {
          currentSequenceId: 5,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      };
      const sendEventsList = jest.spyOn(sessionReplay, 'sendEventsList');
      sessionReplay.sendStoredEvents(store);
      expect(sendEventsList).toHaveBeenCalledTimes(1);
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
      const sampleRate = sessionReplay.getSampleRate();
      expect(sampleRate).toBe(mockOptions.sampleRate);
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(true);
    });
    test('should return false if no options', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockEmptyOptions).promise;
      const sampleRate = sessionReplay.getSampleRate();
      expect(sampleRate).toBe(DEFAULT_SAMPLE_RATE);
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('should return false if session not included in sample rate', async () => {
      jest.spyOn(Helpers, 'isSessionInSample').mockImplementationOnce(() => false);

      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.2 }).promise;
      const sampleRate = sessionReplay.getSampleRate();
      expect(sampleRate).toBe(0.2);
      const shouldRecord = sessionReplay.getShouldRecord();
      expect(shouldRecord).toBe(false);
    });
    test('should set record as true if session is included in sample rate', async () => {
      jest.spyOn(Helpers, 'isSessionInSample').mockImplementationOnce(() => true);

      const sessionReplay = new SessionReplay();
      sessionReplay.config = { apiKey, ...mockOptions, sampleRate: 0.2 } as SessionReplayConfig;
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
      sessionReplay.stopRecordingEvents = mockStopRecordingEvents;
      sessionReplay.stopRecordingAndSendEvents();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });
    test('it should send events for passed session', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const sendEventsListMock = jest.fn();
      sessionReplay.sendEventsList = sendEventsListMock;
      sessionReplay.events = [mockEventString];
      sessionReplay.currentSequenceId = 4;
      sessionReplay.stopRecordingAndSendEvents(123);
      expect(sendEventsListMock).toHaveBeenCalledWith({
        events: [mockEventString],
        sessionId: 123,
        sequenceId: 4,
      });
    });
    test('it should send events for config session if none passed', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const sendEventsListMock = jest.fn();
      sessionReplay.sendEventsList = sendEventsListMock;
      sessionReplay.events = [mockEventString];
      sessionReplay.currentSequenceId = 4;
      sessionReplay.stopRecordingAndSendEvents();
      expect(sendEventsListMock).toHaveBeenCalledWith({
        events: [mockEventString],
        sessionId: 123,
        sequenceId: 4,
      });
    });
    test('it should not send if no config', async () => {
      const sessionReplay = new SessionReplay();
      const sendEventsListMock = jest.fn();
      sessionReplay.sendEventsList = sendEventsListMock;
      sessionReplay.stopRecordingAndSendEvents();
      expect(sendEventsListMock).not.toHaveBeenCalled();
    });
  });

  describe('recordEvents', () => {
    test('should return early if no config', () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.recordEvents();
      expect(record).not.toHaveBeenCalled();
      expect(sessionReplay.events).toEqual([]);
    });

    test('should return early if user opts out', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, optOut: true, privacyConfig: { blockSelector: ['#class'] } })
        .promise;
      sessionReplay.recordEvents();
      expect(record).not.toHaveBeenCalled();
      expect(sessionReplay.events).toEqual([]);
    });

    test('should store events in class and in IDB', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.recordEvents();
      expect(sessionReplay.events).toEqual([]);
      const recordArg = record.mock.calls[0][0];
      // Emit event, which is stored in class and IDB
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sessionReplay.events).toEqual([mockEventString]);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1]({})).toEqual({
        123: {
          currentSequenceId: 0,
          sessionSequences: {
            0: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      });
    });

    test('should split the events list at an increasing interval and send', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.timeAtLastSend = new Date('2023-07-31 08:30:00').getTime();
      sessionReplay.recordEvents();
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      const sendEventsList = jest.spyOn(sessionReplay, 'sendEventsList');
      const recordArg = record.mock.calls[0][0];
      // Emit first event, which is not sent immediately
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sendEventsList).toHaveBeenCalledTimes(0);
      // Emit second event and advance timers to interval
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:31:00').getTime());
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sendEventsList).toHaveBeenCalledTimes(1);
      expect(sendEventsList).toHaveBeenCalledWith({
        events: [mockEventString],
        sequenceId: 0,
        sessionId: 123,
      });
      expect(sessionReplay.events).toEqual([mockEventString]);
      expect(sessionReplay.currentSequenceId).toEqual(1);
    });

    test('should split the events list at max size and send', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.maxPersistedEventsSize = 20;
      // Simulate as if many events have already been built up
      const events = ['#'.repeat(20)];
      sessionReplay.events = events;
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const sendEventsListMock = jest.spyOn(sessionReplay, 'sendEventsList').mockImplementationOnce(() => {});
      sessionReplay.recordEvents();

      const recordArg = record.mock.calls[0][0];
      recordArg?.emit && recordArg?.emit(mockEvent);

      expect(sendEventsListMock).toHaveBeenCalledTimes(1);
      expect(sendEventsListMock).toHaveBeenCalledWith({
        events,
        sequenceId: 0,
        sessionId: 123,
      });

      expect(sessionReplay.events).toEqual([mockEventString]);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1]({})).toEqual({
        123: {
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      });
    });

    test('should stop recording and send events if document is not in focus', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.recordEvents();
      const stopRecordingMock = jest.fn();
      sessionReplay.stopRecordingEvents = stopRecordingMock;
      expect(sessionReplay.events).toEqual([]);
      sessionReplay.events = [mockEventString]; // Add one event to list to trigger sending in stopRecordingAndSendEvents
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue({
        document: {
          hasFocus: () => false,
        },
      } as typeof globalThis);
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const sendEventsListMock = jest.spyOn(sessionReplay, 'sendEventsList').mockImplementationOnce(() => {});
      const recordArg = record.mock.calls[0][0];
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sendEventsListMock).toHaveBeenCalledTimes(1);
      expect(sendEventsListMock).toHaveBeenCalledWith({
        events: [mockEventString],
        sequenceId: 0,
        sessionId: 123,
      });
      expect(stopRecordingMock).toHaveBeenCalled();
      expect(sessionReplay.stopRecordingEvents).toEqual(null);
      expect(sessionReplay.events).toEqual([mockEventString]); // events should not change, emmitted event should be ignored
    });

    test('should stop recording and send events if user opts out during recording', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      sessionReplay.recordEvents();
      const stopRecordingMock = jest.fn();
      sessionReplay.stopRecordingEvents = stopRecordingMock;
      expect(sessionReplay.events).toEqual([]);
      sessionReplay.events = [mockEventString]; // Add one event to list to trigger sending in stopRecordingAndSendEvents
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const sendEventsListMock = jest.spyOn(sessionReplay, 'sendEventsList').mockImplementationOnce(() => {});
      sessionReplay.shouldOptOut = () => true;
      const recordArg = record.mock.calls[0][0];
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sendEventsListMock).toHaveBeenCalledTimes(1);
      expect(sendEventsListMock).toHaveBeenCalledWith({
        events: [mockEventString],
        sequenceId: 0,
        sessionId: 123,
      });
      expect(stopRecordingMock).toHaveBeenCalled();
      expect(sessionReplay.stopRecordingEvents).toEqual(null);
      expect(sessionReplay.events).toEqual([mockEventString]); // events should not change, emmitted event should be ignored
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

  describe('sendEventsList', () => {
    test('should return early if config is not set', async () => {
      const sessionReplay = new SessionReplay();
      const trackSendEventsList = jest.spyOn(sessionReplay.trackDestination, 'sendEventsList');
      sessionReplay.sendEventsList({
        events: [mockEventString],
        sequenceId: 4,
        sessionId: 123,
      });

      expect(trackSendEventsList).not.toHaveBeenCalled();
    });

    test('should call trackDestination sendEventsList', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const trackSendEventsList = jest.spyOn(sessionReplay.trackDestination, 'sendEventsList');
      sessionReplay.sendEventsList({
        events: [mockEventString],
        sequenceId: 4,
        sessionId: 123,
      });

      expect(trackSendEventsList).toHaveBeenCalledWith({
        events: [mockEventString],
        sequenceId: 4,
        sessionId: 123,
        flushMaxRetries: mockOptions.flushMaxRetries,
        apiKey: apiKey,
        deviceId: mockOptions.deviceId,
        sampleRate: mockOptions.sampleRate,
        serverZone: mockOptions.serverZone,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        onComplete: expect.anything(),
      });
    });
    test('should update IDB store upon success', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const cleanUpSessionEventsStore = jest.spyOn(sessionReplay, 'cleanUpSessionEventsStore');
      sessionReplay.sendEventsList({
        events: [mockEventString],
        sequenceId: 4,
        sessionId: 123,
      });
      await runScheduleTimers();
      expect(cleanUpSessionEventsStore).toHaveBeenCalledTimes(1);
      expect(cleanUpSessionEventsStore.mock.calls[0]).toEqual([123, 4]);
    });
    test('should remove session events from IDB store upon failure', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const cleanUpSessionEventsStore = jest
        .spyOn(sessionReplay, 'cleanUpSessionEventsStore')
        .mockReturnValueOnce(Promise.resolve());
      (global.fetch as jest.Mock).mockImplementationOnce(() => Promise.reject());

      sessionReplay.sendEventsList({
        events: [mockEventString],
        sequenceId: 4,
        sessionId: 123,
      });
      await runScheduleTimers();
      expect(cleanUpSessionEventsStore).toHaveBeenCalledTimes(1);
      expect(cleanUpSessionEventsStore.mock.calls[0]).toEqual([123, 4]);
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

  describe('getSampleRate', () => {
    test('should return default value if no config set', () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.config = undefined;
      const sampleRate = sessionReplay.getSampleRate();
      expect(sampleRate).toEqual(DEFAULT_SAMPLE_RATE);
    });
  });

  describe('module level integration', () => {
    describe('with a sample rate', () => {
      test('should not record session if excluded due to sampling', async () => {
        jest.spyOn(Helpers, 'isSessionInSample').mockImplementation(() => false);
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.2 }).promise;
        const sampleRate = sessionReplay.getSampleRate();
        expect(sampleRate).toBe(0.2);
        const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
        expect(sessionRecordingProperties).toMatchObject({});
        expect(record).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
        await runScheduleTimers();
        expect(fetch).not.toHaveBeenCalled();
      });
      test('should record session if included due to sampling', async () => {
        jest.spyOn(Helpers, 'isSessionInSample').mockImplementation(() => true);
        (fetch as jest.Mock).mockImplementationOnce(() => {
          return Promise.resolve({
            status: 200,
          });
        });
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockOptions, sampleRate: 0.8 }).promise;
        const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
        expect(sessionRecordingProperties).toMatchObject({
          [DEFAULT_SESSION_REPLAY_PROPERTY]: '1a2b3c/123',
        });
        // Log is called from setup, but that's not what we're testing here
        mockLoggerProvider.log.mockClear();
        expect(record).toHaveBeenCalled();
        const recordArg = record.mock.calls[0][0];
        recordArg?.emit && recordArg?.emit(mockEvent);
        sessionReplay.stopRecordingAndSendEvents();
        await runScheduleTimers();
        expect(fetch).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLoggerProvider.log).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(mockLoggerProvider.log.mock.calls[0][0]).toEqual(getSuccessMessage(123));
      });
    });
    describe('without a sample rate', () => {
      test('should not record session if no sample rate is provided', async () => {
        jest.spyOn(Helpers, 'isSessionInSample').mockImplementation(() => false);
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockEmptyOptions }).promise;
        const sampleRate = sessionReplay.getSampleRate();
        expect(sampleRate).toBe(DEFAULT_SAMPLE_RATE);
        const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
        expect(sessionRecordingProperties).toMatchObject({});
        expect(record).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
        await runScheduleTimers();
        expect(fetch).not.toHaveBeenCalled();
      });
      test('should not record session if sample rate of value 0 is provided', async () => {
        jest.spyOn(Helpers, 'isSessionInSample').mockImplementation(() => false);
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockEmptyOptions, sampleRate: 0 }).promise;
        const sampleRate = sessionReplay.getSampleRate();
        expect(sampleRate).toBe(DEFAULT_SAMPLE_RATE);
        const sessionRecordingProperties = sessionReplay.getSessionReplayProperties();
        expect(sessionRecordingProperties).toMatchObject({});
        expect(record).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
        await runScheduleTimers();
        expect(fetch).not.toHaveBeenCalled();
      });
    });

    describe('with optOut in config', () => {
      test('should not record session if excluded due to optOut', async () => {
        const sessionReplay = new SessionReplay();
        await sessionReplay.init(apiKey, { ...mockOptions, optOut: true }).promise;
        expect(record).not.toHaveBeenCalled();
        await runScheduleTimers();
        expect(fetch).not.toHaveBeenCalled();
      });
    });
    test('should handle unexpected error', async () => {
      const sessionReplay = new SessionReplay();
      (fetch as jest.Mock).mockImplementationOnce(() => Promise.reject('API Failure'));
      await sessionReplay.init(apiKey, { ...mockOptions }).promise;
      sessionReplay.events = [mockEventString];
      sessionReplay.stopRecordingAndSendEvents();
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual('API Failure');
    });
    test('should not retry for 400 error', async () => {
      (fetch as jest.Mock)
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 400,
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 200,
          });
        });
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;
      // Log is called from init, but that's not what we're testing here
      mockLoggerProvider.log.mockClear();
      sessionReplay.events = [mockEventString];
      sessionReplay.stopRecordingAndSendEvents();
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
    });
    test('should not retry for 413 error', async () => {
      (fetch as jest.Mock)
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 413,
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 200,
          });
        });
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;
      sessionReplay.events = [mockEventString];
      sessionReplay.stopRecordingAndSendEvents();
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
    });
    test('should handle retry for 500 error', async () => {
      (fetch as jest.Mock)
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 500,
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 200,
          });
        });
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;
      sessionReplay.events = [mockEventString];
      sessionReplay.stopRecordingAndSendEvents();
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('should only retry once for 500 error, even if config set to higher than one retry', async () => {
      (fetch as jest.Mock)
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 500,
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 500,
          });
        });
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 10 }).promise;
      sessionReplay.events = [mockEventString];
      sessionReplay.stopRecordingAndSendEvents();
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(2);
    });
    test('should handle retry for 503 error', async () => {
      (fetch as jest.Mock)
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 503,
          });
        })
        .mockImplementationOnce(() => {
          return Promise.resolve({
            status: 200,
          });
        });
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;
      sessionReplay.events = [mockEventString];
      sessionReplay.stopRecordingAndSendEvents();
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(2);
    });
    test('should handle unexpected error where fetch response is null', async () => {
      (fetch as jest.Mock).mockImplementationOnce(() => {
        return Promise.resolve(null);
      });
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, { ...mockOptions, flushMaxRetries: 2 }).promise;
      sessionReplay.events = [mockEventString];
      sessionReplay.stopRecordingAndSendEvents();
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(UNEXPECTED_ERROR_MESSAGE);
    });
  });

  describe('getAllSessionEventsFromStore', () => {
    test('should catch errors', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      get.mockImplementationOnce(() => Promise.reject('error'));
      await sessionReplay.getAllSessionEventsFromStore();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(
        'Failed to store session replay events in IndexedDB: error',
      );
    });
  });

  describe('cleanUpSessionEventsStore', () => {
    test('should update events and status for current session', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const currentSessionId = new Date('2023-07-31 07:30:00').getTime();
      const mockIDBStore: IDBStore = {
        [currentSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            2: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      };
      await sessionReplay.cleanUpSessionEventsStore(currentSessionId, 3);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        [currentSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            2: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
            3: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      });
    });

    test('should delete sent sequences for current session', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const currentSessionId = new Date('2023-07-31 07:30:00').getTime();
      const mockIDBStore: IDBStore = {
        [currentSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            2: {
              events: [],
              status: RecordingStatus.SENT,
            },
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      };
      await sessionReplay.cleanUpSessionEventsStore(currentSessionId, 3);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        [currentSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      });
    });

    test('should keep sessions that are less than 3 days old, and delete sessions that are more than 3 days old', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      const fourDayOldSessionId = new Date('2023-07-27 07:30:00').getTime();
      const oneDayOldSessionId = new Date('2023-07-30 07:30:00').getTime();
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const mockIDBStore: IDBStore = {
        [oneDayOldSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        [fourDayOldSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      };
      await sessionReplay.cleanUpSessionEventsStore(oneDayOldSessionId, 3);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        [oneDayOldSessionId]: {
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      });
    });
    test('should catch errors', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      update.mockImplementationOnce(() => Promise.reject('error'));
      await sessionReplay.cleanUpSessionEventsStore(123, 1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(
        'Failed to store session replay events in IndexedDB: error',
      );
    });
    test('should handle an undefined store', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      update.mockImplementationOnce(() => Promise.resolve());
      await sessionReplay.cleanUpSessionEventsStore(123, 1);
      expect(update.mock.calls[0][1](undefined)).toEqual({});
    });
  });

  describe('storeEventsForSession', () => {
    test('should update the session current sequence id, and the current sequence events and status', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const mockIDBStore: IDBStore = {
        123: {
          currentSequenceId: 2,
          sessionSequences: {
            2: {
              events: [],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        456: {
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      };
      await sessionReplay.storeEventsForSession([mockEventString], 2, 123);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        123: {
          currentSequenceId: 2,
          sessionSequences: {
            2: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        456: {
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      });
    });
    test('should add a new entry if none exist for sequence id', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const mockIDBStore: IDBStore = {
        123: {
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
        456: {
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      };
      await sessionReplay.storeEventsForSession([mockEventString], 2, 123);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        123: {
          currentSequenceId: 2,
          sessionSequences: {
            1: {
              events: [],
              status: RecordingStatus.SENT,
            },
            2: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        456: {
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      });
    });
    test('should add a new entry if none exist for session id', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      const mockIDBStore: IDBStore = {
        123: {
          currentSequenceId: 2,
          sessionSequences: {
            2: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      };
      await sessionReplay.storeEventsForSession([mockEventString], 0, 456);

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        123: {
          currentSequenceId: 2,
          sessionSequences: {
            2: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
        456: {
          currentSequenceId: 0,
          sessionSequences: {
            0: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      });
    });
    test('should catch errors', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      update.mockImplementationOnce(() => Promise.reject('error'));
      await sessionReplay.storeEventsForSession([mockEventString], 0, mockOptions.sessionId as number);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.warn.mock.calls[0][0]).toEqual(
        'Failed to store session replay events in IndexedDB: error',
      );
    });
    test('should handle an undefined store', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
      update.mockImplementationOnce(() => Promise.resolve());
      await sessionReplay.storeEventsForSession([mockEventString], 0, 456);
      expect(update.mock.calls[0][1](undefined)).toEqual({
        456: {
          currentSequenceId: 0,
          sessionSequences: {
            0: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
      });
    });
  });

  describe('shouldSplitEventsList', () => {
    describe('event list size', () => {
      test('should return true if size of events list plus size of next event is over the max size', () => {
        const sessionReplay = new SessionReplay();
        const eventsList = ['#'.repeat(20)];
        sessionReplay.events = eventsList;
        sessionReplay.maxPersistedEventsSize = 20;
        const nextEvent = 'a';
        const result = sessionReplay.shouldSplitEventsList(nextEvent);
        expect(result).toBe(true);
      });
      test('should return false if size of events list plus size of next event is under the max size', () => {
        const sessionReplay = new SessionReplay();
        const eventsList = ['#'.repeat(20)];
        sessionReplay.events = eventsList;
        sessionReplay.maxPersistedEventsSize = 22;
        const nextEvent = 'a';
        const result = sessionReplay.shouldSplitEventsList(nextEvent);
        expect(result).toBe(false);
      });
    });
    describe('interval', () => {
      test('should return false if timeAtLastSend is null', () => {
        const sessionReplay = new SessionReplay();
        const nextEvent = 'a';
        const result = sessionReplay.shouldSplitEventsList(nextEvent);
        expect(result).toBe(false);
      });
      test('should return false if it has not been long enough since last send', () => {
        const sessionReplay = new SessionReplay();
        sessionReplay.timeAtLastSend = new Date('2023-07-31 08:30:00').getTime();
        jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
        const nextEvent = 'a';
        const result = sessionReplay.shouldSplitEventsList(nextEvent);
        expect(result).toBe(false);
      });
      test('should return true if it has been long enough since last send and events have been emitted', () => {
        const sessionReplay = new SessionReplay();
        sessionReplay.events = [mockEventString];
        sessionReplay.timeAtLastSend = new Date('2023-07-31 08:30:00').getTime();
        jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:33:00').getTime());
        const nextEvent = 'a';
        const result = sessionReplay.shouldSplitEventsList(nextEvent);
        expect(result).toBe(true);
      });
    });
  });

  describe('flush', () => {
    test('should call track destination flush with useRetry as true', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;

      const flushMock = jest.spyOn(sessionReplay.trackDestination, 'flush');

      await sessionReplay.flush(true);
      expect(flushMock).toHaveBeenCalled();
      expect(flushMock).toHaveBeenCalledWith(true);
    });
    test('should call track destination flush without useRetry', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;

      const flushMock = jest.spyOn(sessionReplay.trackDestination, 'flush');

      await sessionReplay.flush();
      expect(flushMock).toHaveBeenCalled();
      expect(flushMock).toHaveBeenCalledWith(false);
    });
  });

  describe('shutdown', () => {
    test('should remove event listeners', async () => {
      const sessionReplay = new SessionReplay();
      await sessionReplay.init(apiKey, mockOptions).promise;
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
      sessionReplay.stopRecordingEvents = stopRecordingMock;
      sessionReplay.events = [mockEventString];
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const sendEventsListMock = jest.spyOn(sessionReplay, 'sendEventsList').mockImplementationOnce(() => {});
      sessionReplay.shutdown();
      expect(stopRecordingMock).toHaveBeenCalled();
      expect(sessionReplay.stopRecordingEvents).toBe(null);
      expect(sendEventsListMock).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(sendEventsListMock.mock.calls[0][0]).toEqual({
        events: [mockEventString],
        sequenceId: 0,
        sessionId: 123,
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
  });

  describe('getSessionReplayDebugPropertyValue', () => {
    test('null config', () => {
      const sessionReplay = new SessionReplay();
      sessionReplay.config = undefined;
      expect(sessionReplay.getSessionReplayDebugPropertyValue()).toBe('{"appHash":""}');
    });
  });
});
