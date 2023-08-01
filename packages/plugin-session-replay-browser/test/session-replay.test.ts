/* eslint-disable jest/expect-expect */
import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';
import { CookieStorage, FetchTransport } from '@amplitude/analytics-client-common';
import { BrowserConfig, LogLevel, Logger, ServerZone } from '@amplitude/analytics-types';
import * as IDBKeyVal from 'idb-keyval';
import * as RRWeb from 'rrweb';
import { UNEXPECTED_ERROR_MESSAGE, getSuccessMessage } from '../src/messages';
import { sessionReplayPlugin } from '../src/session-replay';
import { IDBStore, RecordingStatus } from '../src/typings/session-replay';

jest.mock('idb-keyval');
type MockedIDBKeyVal = jest.Mocked<typeof import('idb-keyval')>;

jest.mock('rrweb');
type MockedRRWeb = jest.Mocked<typeof import('rrweb')>;

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
  let mockLoggerProvider: MockedLogger;
  let addEventListenerMock: jest.Mock<typeof window.addEventListener>;
  const mockConfig: BrowserConfig = {
    apiKey: 'static_key',
    flushIntervalMillis: 0,
    flushMaxRetries: 1,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: {
      error: jest.fn(),
      log: jest.fn(),
      disable: jest.fn(),
      enable: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    },
    optOut: false,
    serverUrl: 'url',
    transportProvider: new FetchTransport(),
    useBatch: false,
    sessionId: 123,
    cookieExpiration: 365,
    cookieSameSite: 'Lax',
    cookieSecure: false,
    cookieStorage: new CookieStorage(),
    cookieUpgrade: true,
    disableCookies: false,
    domain: '.amplitude.com',
    sessionTimeout: 30 * 60 * 1000,
    trackingOptions: {
      ipAddress: true,
      language: true,
      platform: true,
    },
  };
  beforeEach(() => {
    jest.useFakeTimers();
    originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 200,
      }),
    ) as jest.Mock;
    addEventListenerMock = jest.fn() as typeof addEventListenerMock;
    jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue({
      window: {
        addEventListener: addEventListenerMock,
      } as unknown as Window,
      document: {
        hasFocus: () => true,
      },
    } as Window & typeof globalThis);
    mockLoggerProvider = {
      error: jest.fn(),
      log: jest.fn(),
      disable: jest.fn(),
      enable: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.spyOn(global.Math, 'random').mockRestore();
    global.fetch = originalFetch;
    jest.useRealTimers();
  });
  describe('setup', () => {
    test('should setup plugin', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup(mockConfig);
      expect(sessionReplay.config.transportProvider).toBeDefined();
      expect(sessionReplay.config.serverUrl).toBe('url');
      expect(sessionReplay.config.flushMaxRetries).toBe(1);
      expect(sessionReplay.config.flushQueueSize).toBe(0);
      expect(sessionReplay.config.flushIntervalMillis).toBe(0);
      expect(sessionReplay.storageKey).toBe('AMP_replay_unsent_static_key');
    });

    test('should call initalize with shouldSendStoredEvents=true', async () => {
      const sessionReplay = sessionReplayPlugin();
      const initalize = jest.spyOn(sessionReplay, 'initialize').mockReturnValueOnce(Promise.resolve());
      await sessionReplay.setup(mockConfig);

      expect(initalize).toHaveBeenCalledTimes(1);

      expect(initalize.mock.calls[0]).toEqual([true]);
    });
    test('should set up blur and focus event listeners', async () => {
      const sessionReplay = sessionReplayPlugin();
      const stopRecordingMock = jest.fn();
      sessionReplay.stopRecordingEvents = stopRecordingMock;
      const initialize = jest.spyOn(sessionReplay, 'initialize').mockReturnValueOnce(Promise.resolve());
      await sessionReplay.setup(mockConfig);
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
      const sessionReplay = sessionReplayPlugin();
      const initialize = jest.spyOn(sessionReplay, 'initialize').mockReturnValueOnce(Promise.resolve());
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue({
        document: {
          hasFocus: () => false,
        },
      } as typeof globalThis);
      expect(initialize).not.toHaveBeenCalled();
    });
  });

  describe('initalize', () => {
    test('should read events from storage and send them if shouldSendStoredEvents is true', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        sessionId: 456,
      };
      sessionReplay.config = config;
      const mockGetResolution: Promise<IDBStore> = Promise.resolve({
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
        456: {
          shouldRecord: true,
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
      const send = jest.spyOn(sessionReplay, 'send').mockReturnValueOnce(Promise.resolve());

      await sessionReplay.initialize(true);
      await mockGetResolution;
      jest.runAllTimers();
      expect(send).toHaveBeenCalledTimes(1);

      // Should send only events from sequences marked as recording and not current session
      expect(send.mock.calls[0][0]).toEqual({
        attempts: 1,
        events: [mockEventString],
        sequenceId: 3,
        sessionId: 123,
        timeout: 0,
      });
    });
    test('should return early if using old format of IDBStore', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        sessionId: 456,
      };
      sessionReplay.config = config;
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
      const send = jest.spyOn(sessionReplay, 'send').mockReturnValueOnce(Promise.resolve());

      await sessionReplay.initialize(true);
      await mockGetResolution;
      jest.runAllTimers();
      expect(send).toHaveBeenCalledTimes(0);
    });
    test('should return early if session id not set', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        sessionId: undefined,
      };
      sessionReplay.config = config;
      const getAllSessionEventsFromStore = jest
        .spyOn(sessionReplay, 'getAllSessionEventsFromStore')
        .mockReturnValueOnce(Promise.resolve({}));
      await sessionReplay.initialize();
      expect(getAllSessionEventsFromStore).not.toHaveBeenCalled();
    });
    test('should return early if stopRecordingEvents is already defined, signaling that recording is already in progress', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
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
    test('should configure current sequence id and events correctly if last sequence was sending', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const mockGetResolution: Promise<IDBStore> = Promise.resolve({
        123: {
          shouldRecord: true,
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: RecordingStatus.SENDING,
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
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const mockGetResolution: Promise<IDBStore> = Promise.resolve({
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
      });
      get.mockReturnValueOnce(mockGetResolution);
      await sessionReplay.initialize();
      expect(sessionReplay.currentSequenceId).toEqual(3);
      expect(sessionReplay.events).toEqual([mockEventString]);
    });
    test('should handle no stored events', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const mockGetResolution = Promise.resolve({});
      get.mockReturnValueOnce(mockGetResolution);
      await sessionReplay.initialize();
      expect(sessionReplay.currentSequenceId).toBe(0);
      expect(sessionReplay.events).toEqual([]);
    });
    test('should handle no stored sequences for session', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const mockGetResolution = Promise.resolve({
        123: {
          shouldRecord: true,
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
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const mockGetResolution = Promise.resolve({});
      get.mockReturnValueOnce(mockGetResolution);
      await sessionReplay.initialize();
      expect(record).toHaveBeenCalledTimes(1);
    });
    describe('defaultTracking', () => {
      test('should not change defaultTracking if its set to true', async () => {
        const sessionReplay = sessionReplayPlugin();
        await sessionReplay.setup({
          ...mockConfig,
          defaultTracking: true,
        });
        expect(sessionReplay.config.defaultTracking).toBe(true);
      });
      test('should modify defaultTracking to enable sessions if its set to false', async () => {
        const sessionReplay = sessionReplayPlugin();
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
        const sessionReplay = sessionReplayPlugin();
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
  });

  describe('setShouldRecord', () => {
    test('should set record as false if false in session store', () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const sessionStore = {
        shouldRecord: false,
        currentSequenceId: 0,
        sessionSequences: {},
      };
      expect(sessionReplay.shouldRecord).toBe(true);
      sessionReplay.setShouldRecord(sessionStore);
      expect(sessionReplay.shouldRecord).toBe(false);
    });
    test('should set record as true if true in session store', () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      sessionReplay.shouldRecord = false; // Set to false to be sure the setShouldRecord changes the value
      const sessionStore = {
        shouldRecord: true,
        currentSequenceId: 0,
        sessionSequences: {},
      };
      sessionReplay.setShouldRecord(sessionStore);
      expect(sessionReplay.shouldRecord).toBe(true);
    });
    test('should not set record as false if no options', () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      sessionReplay.setShouldRecord();
      expect(sessionReplay.shouldRecord).toBe(true);
    });
    test('should set record as false if session not included in sample rate', () => {
      jest.spyOn(Math, 'random').mockImplementationOnce(() => 0.7);
      const sessionReplay = sessionReplayPlugin({
        sampleRate: 0.2,
      });
      sessionReplay.config = mockConfig;
      expect(sessionReplay.shouldRecord).toBe(true);
      sessionReplay.setShouldRecord();
      expect(sessionReplay.shouldRecord).toBe(false);
    });
    test('should set record as true if session is included in sample rate', () => {
      jest.spyOn(Math, 'random').mockImplementationOnce(() => 0.7);
      const sessionReplay = sessionReplayPlugin({
        sampleRate: 0.8,
      });
      sessionReplay.config = mockConfig;
      sessionReplay.setShouldRecord();
      expect(sessionReplay.shouldRecord).toBe(true);
    });
    test('should set record as false if opt out in config', () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = {
        ...mockConfig,
        optOut: true,
      };
      sessionReplay.setShouldRecord();
      expect(sessionReplay.shouldRecord).toBe(false);
    });
    test('opt out in config should override the sample rate', () => {
      jest.spyOn(Math, 'random').mockImplementationOnce(() => 0.7);
      const sessionReplay = sessionReplayPlugin({
        sampleRate: 0.8,
      });
      sessionReplay.config = {
        ...mockConfig,
        optOut: true,
      };
      sessionReplay.setShouldRecord();
      expect(sessionReplay.shouldRecord).toBe(false);
    });
  });

  describe('execute', () => {
    test('it should return event if document does not have focus', async () => {
      const sessionReplay = sessionReplayPlugin();
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue({
        document: {
          hasFocus: () => false,
        },
      } as typeof globalThis);
      await sessionReplay.setup(mockConfig);
      const event = {
        event_type: 'event_type',
        event_properties: {
          property_a: true,
          property_b: 123,
        },
      };

      const executedEvent = await sessionReplay.execute(event);
      expect(executedEvent).toEqual(event);
    });
    test('should add event property for [Amplitude] Session Recorded', async () => {
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup(mockConfig);
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

    test('should restart recording events when session_start fires', async () => {
      const sessionReplay = sessionReplayPlugin();
      const mockGetResolution = Promise.resolve({});
      get.mockReturnValueOnce(mockGetResolution);
      await sessionReplay.setup(mockConfig);
      await mockGetResolution;
      jest.runAllTimers();
      const event = {
        event_type: 'session_start',
      };
      await sessionReplay.execute(event);
      expect(record).toHaveBeenCalledTimes(2);
    });

    test('should send the current events list when session_end fires and stop recording events', async () => {
      const sessionReplay = sessionReplayPlugin();
      const mockStopRecordingEvents = jest.fn();
      sessionReplay.stopRecordingEvents = mockStopRecordingEvents;
      sessionReplay.config = mockConfig;
      const send = jest.spyOn(sessionReplay, 'send').mockReturnValueOnce(Promise.resolve());

      const event = {
        event_type: 'session_end',
        session_id: 789,
      };
      sessionReplay.events = [mockEventString];
      await sessionReplay.execute(event);
      expect(mockStopRecordingEvents).toHaveBeenCalledTimes(1);
      jest.runAllTimers();
      expect(send).toHaveBeenCalledTimes(1);

      // Sending first stored session events
      expect(send.mock.calls[0][0]).toEqual({
        attempts: 1,
        events: [mockEventString],
        sequenceId: 0,
        sessionId: 789,
        timeout: 0,
      });
    });
  });

  describe('recordEvents', () => {
    test('should store events in class and in IDB', () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      sessionReplay.recordEvents();
      expect(sessionReplay.events).toEqual([]);
      const recordArg = record.mock.calls[0][0];
      // Emit event, which is stored in class and IDB
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sessionReplay.events).toEqual([mockEventString]);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1]({})).toEqual({
        123: {
          shouldRecord: true,
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

    test('should split the events list at an increasing interval and send', () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
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

    test('should split the events list at max size and send', () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
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
          shouldRecord: true,
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

    test('should return early if document is not in focus', () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      sessionReplay.recordEvents();
      sessionReplay.stopRecordingEvents = jest.fn();
      expect(sessionReplay.events).toEqual([]);
      jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue({
        document: {
          hasFocus: () => false,
        },
      } as typeof globalThis);
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      const sendEventsListMock = jest.spyOn(sessionReplay, 'sendEventsList').mockImplementationOnce(() => {});
      const recordArg = record.mock.calls[0][0];
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sendEventsListMock).toHaveBeenCalledTimes(0);
      expect(sessionReplay.stopRecordingEvents).toHaveBeenCalled();
      expect(sessionReplay.events).toEqual([]);
    });
  });

  describe('addToQueue', () => {
    test('should add to queue and schedule a flush', () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const schedule = jest.spyOn(sessionReplay, 'schedule').mockReturnValueOnce(undefined);
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        attempts: 0,
        timeout: 0,
      };
      sessionReplay.addToQueue(context);
      expect(schedule).toHaveBeenCalledTimes(1);
      expect(schedule).toHaveBeenCalledWith(0);
      expect(context.attempts).toBe(1);
    });

    test('should not add to queue if attemps are greater than allowed retries', () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = {
        ...mockConfig,
        flushMaxRetries: 1,
      };
      const completeRequest = jest.spyOn(sessionReplay, 'completeRequest').mockReturnValueOnce(undefined);
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        attempts: 1,
        timeout: 0,
      };
      sessionReplay.addToQueue(context);
      expect(completeRequest).toHaveBeenCalledTimes(1);
      expect(completeRequest).toHaveBeenCalledWith({
        context: {
          events: [mockEventString],
          sequenceId: 1,
          sessionId: 123,
          attempts: 1,
          timeout: 0,
        },
        err: 'Session replay event batch rejected due to exceeded retry count, batch sequence id, 1',
      });
    });
  });

  describe('schedule', () => {
    test('should schedule a flush', async () => {
      const sessionReplay = sessionReplayPlugin();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (sessionReplay as any).scheduled = null;
      sessionReplay.queue = [
        {
          events: [mockEventString],
          sequenceId: 1,
          sessionId: 123,
          attempts: 0,
          timeout: 0,
        },
      ];
      const flush = jest
        .spyOn(sessionReplay, 'flush')
        .mockImplementationOnce(() => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (sessionReplay as any).scheduled = null;
          return Promise.resolve(undefined);
        })
        .mockReturnValueOnce(Promise.resolve(undefined));
      sessionReplay.schedule(0);
      await runScheduleTimers();
      expect(flush).toHaveBeenCalledTimes(2);
    });

    test('should not schedule if one is already in progress', () => {
      const sessionReplay = sessionReplayPlugin();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (sessionReplay as any).scheduled = setTimeout(jest.fn, 0);
      const flush = jest.spyOn(sessionReplay, 'flush').mockReturnValueOnce(Promise.resolve(undefined));
      sessionReplay.schedule(0);
      expect(flush).toHaveBeenCalledTimes(0);
    });
  });

  describe('flush', () => {
    test('should call send', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      sessionReplay.queue = [
        {
          events: [mockEventString],
          sequenceId: 1,
          sessionId: 123,
          attempts: 0,
          timeout: 0,
        },
      ];
      const send = jest.spyOn(sessionReplay, 'send').mockReturnValueOnce(Promise.resolve());
      const result = await sessionReplay.flush();
      expect(sessionReplay.queue).toEqual([]);
      expect(result).toBe(undefined);
      expect(send).toHaveBeenCalledTimes(1);
    });

    test('should send later', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      sessionReplay.queue = [
        {
          events: [mockEventString],
          sequenceId: 1,
          sessionId: 123,
          attempts: 0,
          timeout: 1000,
        },
      ];
      const send = jest.spyOn(sessionReplay, 'send').mockReturnValueOnce(Promise.resolve());
      const result = await sessionReplay.flush();
      expect(sessionReplay.queue).toEqual([
        {
          events: [mockEventString],
          sequenceId: 1,
          sessionId: 123,
          attempts: 0,
          timeout: 1000,
        },
      ]);
      expect(result).toBe(undefined);
      expect(send).toHaveBeenCalledTimes(0);
    });
  });

  describe('send', () => {
    test('should make a request correctly', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        attempts: 0,
        timeout: 0,
      };

      await sessionReplay.send(context);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith('https://api-secure.amplitude.com/sessions/track', {
        body: JSON.stringify({
          api_key: 'static_key',
          session_id: 123,
          start_timestamp: 123,
          events_batch: { version: 1, events: [mockEventString], seq_number: 1 },
        }),
        headers: { Accept: '*/*', 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });
    test('should make a request to eu', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = {
        ...mockConfig,
        serverZone: ServerZone.EU,
      };

      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        attempts: 0,
        timeout: 0,
      };

      await sessionReplay.send(context);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith('https://api.eu.amplitude.com/sessions/track', {
        body: JSON.stringify({
          api_key: 'static_key',
          session_id: 123,
          start_timestamp: 123,
          events_batch: { version: 1, events: [mockEventString], seq_number: 1 },
        }),
        headers: { Accept: '*/*', 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });
    test('should update IDB store upon success', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        attempts: 0,
        timeout: 0,
      };
      const cleanUpSessionEventsStore = jest
        .spyOn(sessionReplay, 'cleanUpSessionEventsStore')
        .mockReturnValueOnce(Promise.resolve());
      await sessionReplay.send(context);
      jest.runAllTimers();
      expect(cleanUpSessionEventsStore).toHaveBeenCalledTimes(1);
      expect(cleanUpSessionEventsStore.mock.calls[0]).toEqual([123, 1]);
    });
    test('should remove session events from IDB store upon failure', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        attempts: 0,
        timeout: 0,
      };
      const cleanUpSessionEventsStore = jest
        .spyOn(sessionReplay, 'cleanUpSessionEventsStore')
        .mockReturnValueOnce(Promise.resolve());
      (global.fetch as jest.Mock).mockImplementationOnce(() => Promise.reject());

      await sessionReplay.send(context);
      jest.runAllTimers();
      expect(cleanUpSessionEventsStore).toHaveBeenCalledTimes(1);
      expect(cleanUpSessionEventsStore.mock.calls[0]).toEqual([123, 1]);
    });

    test('should retry if retry param is true', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        attempts: 0,
        timeout: 0,
      };
      (global.fetch as jest.Mock)
        .mockImplementationOnce(() =>
          Promise.resolve({
            status: 500,
          }),
        )
        .mockImplementationOnce(() =>
          Promise.resolve({
            status: 200,
          }),
        );
      const addToQueue = jest.spyOn(sessionReplay, 'addToQueue');

      await sessionReplay.send(context, true);
      expect(addToQueue).toHaveBeenCalledTimes(1);
      expect(addToQueue).toHaveBeenCalledWith({
        ...context,
        attempts: 1,
        timeout: 0,
      });
      await runScheduleTimers();
    });

    test('should not retry if retry param is false', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        attempts: 0,
        timeout: 0,
      };
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          status: 500,
        }),
      );
      const addToQueue = jest.spyOn(sessionReplay, 'addToQueue');

      await sessionReplay.send(context, false);
      expect(addToQueue).toHaveBeenCalledTimes(0);
    });
  });

  describe('module level integration', () => {
    describe('with a sample rate', () => {
      test('should not record session if excluded due to sampling', async () => {
        jest.spyOn(Math, 'random').mockImplementationOnce(() => 0.7);
        const sessionReplay = sessionReplayPlugin({
          sampleRate: 0.2,
        });
        await sessionReplay.setup(mockConfig);
        expect(update).toHaveBeenCalled();
        expect(update.mock.calls[0][1]({})).toEqual({
          123: {
            shouldRecord: false,
            currentSequenceId: 0,
            sessionSequences: {},
          },
        });
        update.mockClear();
        await sessionReplay.execute({
          event_type: 'my_event',
          session_id: 123,
        });
        expect(record).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
        await sessionReplay.execute({
          event_type: 'session_end',
          session_id: 123,
        });
        await runScheduleTimers();
        expect(fetch).not.toHaveBeenCalled();
      });
      test('should recalculate whether to exclude session due to sample rate when start session fires', async () => {
        jest.spyOn(Math, 'random').mockImplementationOnce(() => 0.1);
        const sessionReplay = sessionReplayPlugin({
          sampleRate: 0.2,
        });
        await sessionReplay.setup(mockConfig);
        expect(update).toHaveBeenCalled();
        expect(update.mock.calls[0][1]({})).toEqual({
          123: {
            shouldRecord: true,
            currentSequenceId: 0,
            sessionSequences: {},
          },
        });
        update.mockClear();
        // Record is called in setup, but we're not interested in that now
        record.mockClear();
        // This will exclude session from sample rate
        jest.spyOn(Math, 'random').mockImplementationOnce(() => 0.7);
        await sessionReplay.execute({
          event_type: 'session_start',
          session_id: 123,
        });
        expect(record).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalled();
        expect(update.mock.calls[0][1]({})).toEqual({
          123: {
            shouldRecord: false,
            currentSequenceId: 0,
            sessionSequences: {},
          },
        });
        await sessionReplay.execute({
          event_type: 'session_end',
          session_id: 123,
        });
        await runScheduleTimers();
        expect(fetch).not.toHaveBeenCalled();
      });
      test('should fetch whether to record session from IDB', async () => {
        const sessionReplay = sessionReplayPlugin();
        const mockIDBStore = {
          123: {
            shouldRecord: false,
            currentSequenceId: 0,
            sessionSequences: {},
          },
        };
        get.mockImplementationOnce(() => Promise.resolve(mockIDBStore));
        await sessionReplay.setup(mockConfig);
        expect(record).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalled();
        expect(update.mock.calls[0][1]({})).toEqual({
          123: {
            shouldRecord: false,
            currentSequenceId: 0,
            sessionSequences: {},
          },
        });
        await sessionReplay.execute({
          event_type: 'session_start',
          session_id: 123,
        });
        expect(record).not.toHaveBeenCalled();
      });
      test('should record session if included due to sampling', async () => {
        (fetch as jest.Mock).mockImplementationOnce(() => {
          return Promise.resolve({
            status: 200,
          });
        });
        jest.spyOn(Math, 'random').mockImplementationOnce(() => 0.7);
        const sessionReplay = sessionReplayPlugin({
          sampleRate: 0.8,
        });
        const config = {
          ...mockConfig,
          loggerProvider: mockLoggerProvider,
        };
        await sessionReplay.setup(config);
        await sessionReplay.execute({
          event_type: 'session_start',
          session_id: 456,
        });
        // Log is called from setup, but that's not what we're testing here
        mockLoggerProvider.log.mockClear();
        expect(record).toHaveBeenCalled();
        const recordArg = record.mock.calls[0][0];
        recordArg?.emit && recordArg?.emit(mockEvent);
        await sessionReplay.execute({
          event_type: 'session_end',
          session_id: 456,
        });
        await runScheduleTimers();
        expect(fetch).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(mockLoggerProvider.log).toHaveBeenCalledTimes(1);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(mockLoggerProvider.log.mock.calls[0][0]).toEqual(getSuccessMessage(456));
      });
    });

    describe('with optOut in config', () => {
      test('should not record session if excluded due to optOut', async () => {
        const sessionReplay = sessionReplayPlugin();
        await sessionReplay.setup({
          ...mockConfig,
          optOut: true,
        });
        await sessionReplay.execute({
          event_type: 'session_start',
          session_id: 456,
        });
        expect(record).not.toHaveBeenCalled();
        await sessionReplay.execute({
          event_type: 'session_end',
          session_id: 456,
        });
        await runScheduleTimers();
        expect(fetch).not.toHaveBeenCalled();
      });
    });
    test('should handle unexpected error', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        loggerProvider: mockLoggerProvider,
      };
      (fetch as jest.Mock).mockImplementationOnce(() => Promise.reject('API Failure'));
      await sessionReplay.setup(config);
      sessionReplay.events = [mockEventString];
      await sessionReplay.execute({
        event_type: 'session_end',
        session_id: 456,
      });
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.error.mock.calls[0][0]).toEqual('API Failure');
    });
    test('should handle retry for 400 error', async () => {
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
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.retryTimeout = 10;
      const config = {
        ...mockConfig,
        flushMaxRetries: 2,
        loggerProvider: mockLoggerProvider,
      };
      await sessionReplay.setup(config);
      // Log is called from setup, but that's not what we're testing here
      mockLoggerProvider.log.mockClear();
      sessionReplay.events = [mockEventString];
      await sessionReplay.execute({
        event_type: 'session_end',
        session_id: 456,
      });
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(2);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalledTimes(0);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.log).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.log.mock.calls[0][0]).toEqual(getSuccessMessage(456));
    });
    test('should handle retry for 413 error with flushQueueSize of 1', async () => {
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
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        flushMaxRetries: 2,
      };
      await sessionReplay.setup(config);
      sessionReplay.events = [mockEventString];
      const event = {
        event_type: 'session_end',
        session_id: 456,
      };
      await sessionReplay.execute(event);
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(2);
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
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        flushMaxRetries: 2,
      };
      await sessionReplay.setup(config);
      sessionReplay.events = [mockEventString];
      const event = {
        event_type: 'session_end',
        session_id: 456,
      };
      await sessionReplay.execute(event);
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
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        flushMaxRetries: 2,
      };
      await sessionReplay.setup(config);
      sessionReplay.events = [mockEventString];
      const event = {
        event_type: 'session_end',
        session_id: 456,
      };
      await sessionReplay.execute(event);
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(2);
    });
    test('should handle unexpected error where fetch response is null', async () => {
      (fetch as jest.Mock).mockImplementationOnce(() => {
        return Promise.resolve(null);
      });
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        flushMaxRetries: 2,
        loggerProvider: mockLoggerProvider,
      };
      await sessionReplay.setup(config);
      sessionReplay.events = [mockEventString];
      const event = {
        event_type: 'session_end',
        session_id: 456,
      };
      await sessionReplay.execute(event);
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.error.mock.calls[0][0]).toEqual(UNEXPECTED_ERROR_MESSAGE);
    });
  });

  describe('getAllSessionEventsFromStore', () => {
    test('should catch errors', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        loggerProvider: mockLoggerProvider,
      };
      sessionReplay.config = config;
      get.mockImplementationOnce(() => Promise.reject('error'));
      await sessionReplay.getAllSessionEventsFromStore();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.error.mock.calls[0][0]).toEqual(
        'Failed to store session replay events in IndexedDB: error',
      );
    });
  });
  describe('storeShouldRecordForSession', () => {
    test('should store if should record session', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const mockIDBStore: IDBStore = {
        123: {
          shouldRecord: true,
          currentSequenceId: 3,
          sessionSequences: {
            2: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        456: {
          shouldRecord: true,
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
      };
      await sessionReplay.storeShouldRecordForSession(456, false);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        ...mockIDBStore,
        456: {
          ...mockIDBStore[456],
          shouldRecord: false,
        },
      });
    });
    test('should catch errors', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        loggerProvider: mockLoggerProvider,
      };
      sessionReplay.config = config;
      update.mockImplementationOnce(() => Promise.reject('error'));
      await sessionReplay.storeShouldRecordForSession(123, true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.error.mock.calls[0][0]).toEqual(
        'Failed to store session replay events in IndexedDB: error',
      );
    });
    test('should handle an undefined store', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        loggerProvider: mockLoggerProvider,
      };
      sessionReplay.config = config;
      update.mockImplementationOnce(() => Promise.resolve());
      await sessionReplay.storeShouldRecordForSession(123, true);
      expect(update.mock.calls[0][1](undefined)).toEqual({
        123: {
          shouldRecord: true,
          currentSequenceId: 0,
          sessionSequences: {},
        },
      });
    });
  });

  describe('cleanUpSessionEventsStore', () => {
    test('should update events and status for current session', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const currentSessionId = new Date('2023-07-31 07:30:00').getTime();
      const mockIDBStore: IDBStore = {
        [currentSessionId]: {
          shouldRecord: true,
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
          shouldRecord: true,
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
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const currentSessionId = new Date('2023-07-31 07:30:00').getTime();
      const mockIDBStore: IDBStore = {
        [currentSessionId]: {
          shouldRecord: true,
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
          shouldRecord: true,
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
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const mockIDBStore: IDBStore = {
        [oneDayOldSessionId]: {
          shouldRecord: true,
          currentSequenceId: 3,
          sessionSequences: {
            3: {
              events: [mockEventString],
              status: RecordingStatus.SENDING,
            },
          },
        },
        [fourDayOldSessionId]: {
          shouldRecord: true,
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
          shouldRecord: true,
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
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        loggerProvider: mockLoggerProvider,
      };
      sessionReplay.config = config;
      update.mockImplementationOnce(() => Promise.reject('error'));
      await sessionReplay.cleanUpSessionEventsStore(123, 1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.error.mock.calls[0][0]).toEqual(
        'Failed to store session replay events in IndexedDB: error',
      );
    });
    test('should handle an undefined store', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        loggerProvider: mockLoggerProvider,
      };
      sessionReplay.config = config;
      update.mockImplementationOnce(() => Promise.resolve());
      await sessionReplay.cleanUpSessionEventsStore(123, 1);
      expect(update.mock.calls[0][1](undefined)).toEqual({});
    });
  });

  describe('storeEventsForSession', () => {
    test('should update the session current sequence id, and the current sequence events and status', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const mockIDBStore: IDBStore = {
        123: {
          shouldRecord: true,
          currentSequenceId: 2,
          sessionSequences: {
            2: {
              events: [],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        456: {
          shouldRecord: true,
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
          shouldRecord: true,
          currentSequenceId: 2,
          sessionSequences: {
            2: {
              events: [mockEventString],
              status: RecordingStatus.RECORDING,
            },
          },
        },
        456: {
          shouldRecord: true,
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
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const mockIDBStore: IDBStore = {
        123: {
          shouldRecord: true,
          currentSequenceId: 1,
          sessionSequences: {
            1: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
        456: {
          shouldRecord: true,
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
          shouldRecord: true,
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
          shouldRecord: true,
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
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const mockIDBStore: IDBStore = {
        123: {
          shouldRecord: true,
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
          shouldRecord: true,
          currentSequenceId: 2,
          sessionSequences: {
            2: {
              events: [],
              status: RecordingStatus.SENT,
            },
          },
        },
        456: {
          shouldRecord: true,
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
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        loggerProvider: mockLoggerProvider,
      };
      sessionReplay.config = config;
      update.mockImplementationOnce(() => Promise.reject('error'));
      await sessionReplay.storeEventsForSession([mockEventString], 0, config.sessionId as number);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.error.mock.calls[0][0]).toEqual(
        'Failed to store session replay events in IndexedDB: error',
      );
    });
    test('should handle an undefined store', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        loggerProvider: mockLoggerProvider,
      };
      sessionReplay.config = config;
      update.mockImplementationOnce(() => Promise.resolve());
      await sessionReplay.storeEventsForSession([mockEventString], 0, 456);
      expect(update.mock.calls[0][1](undefined)).toEqual({
        456: {
          shouldRecord: true,
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
        const sessionReplay = sessionReplayPlugin();
        const eventsList = ['#'.repeat(20)];
        sessionReplay.events = eventsList;
        sessionReplay.maxPersistedEventsSize = 20;
        const nextEvent = 'a';
        const result = sessionReplay.shouldSplitEventsList(nextEvent);
        expect(result).toBe(true);
      });
      test('should return false if size of events list plus size of next event is under the max size', () => {
        const sessionReplay = sessionReplayPlugin();
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
        const sessionReplay = sessionReplayPlugin();
        const nextEvent = 'a';
        const result = sessionReplay.shouldSplitEventsList(nextEvent);
        expect(result).toBe(false);
      });
      test('should return false if it has not been long enough since last send', () => {
        const sessionReplay = sessionReplayPlugin();
        sessionReplay.timeAtLastSend = new Date('2023-07-31 08:30:00').getTime();
        jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:30:00').getTime());
        const nextEvent = 'a';
        const result = sessionReplay.shouldSplitEventsList(nextEvent);
        expect(result).toBe(false);
      });
      test('should return true if it has been long enough since last send and events have been emitted', () => {
        const sessionReplay = sessionReplayPlugin();
        sessionReplay.events = [mockEventString];
        sessionReplay.timeAtLastSend = new Date('2023-07-31 08:30:00').getTime();
        jest.useFakeTimers().setSystemTime(new Date('2023-07-31 08:33:00').getTime());
        const nextEvent = 'a';
        const result = sessionReplay.shouldSplitEventsList(nextEvent);
        expect(result).toBe(true);
      });
    });
  });
});
