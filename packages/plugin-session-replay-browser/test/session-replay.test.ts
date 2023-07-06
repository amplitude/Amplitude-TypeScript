/* eslint-disable jest/expect-expect */
import { CookieStorage, FetchTransport } from '@amplitude/analytics-client-common';
import { BrowserConfig, LogLevel } from '@amplitude/analytics-types';
import * as IDBKeyVal from 'idb-keyval';
import * as RRWeb from 'rrweb';
import { SUCCESS_MESSAGE, UNEXPECTED_ERROR_MESSAGE } from '../src/messages';
import { sessionReplayPlugin } from '../src/session-replay';

jest.mock('idb-keyval');
type MockedIDBKeyVal = jest.Mocked<typeof import('idb-keyval')>;

jest.mock('rrweb');
type MockedRRWeb = jest.Mocked<typeof import('rrweb')>;

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

const mockLoggerProvider = {
  error: jest.fn(),
  log: jest.fn(),
  logLevel: 1,
  disable: jest.fn(),
  enable: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

describe('SessionReplayPlugin', () => {
  const { get, update } = IDBKeyVal as MockedIDBKeyVal;
  const { record } = RRWeb as MockedRRWeb;
  let originalFetch: typeof global.fetch;
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
  beforeAll(() => {
    jest.useFakeTimers();
  });
  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 200,
      }),
    ) as jest.Mock;
  });
  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = originalFetch;
  });
  afterAll(() => {
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

    test('should read events from storage and send them, then reset storage for session', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        sessionId: 456,
      };
      const mockGetResolution = Promise.resolve({
        123: {
          events: [mockEventString],
          sequenceId: 3,
        },
        456: {
          events: [mockEventString],
          sequenceId: 1,
        },
      });
      get.mockReturnValueOnce(mockGetResolution);
      const send = jest.spyOn(sessionReplay, 'send').mockReturnValueOnce(Promise.resolve());

      await sessionReplay.setup(config);
      await mockGetResolution;
      jest.runAllTimers();
      expect(send).toHaveBeenCalledTimes(2);

      // Sending first stored session events
      expect(send.mock.calls[0][0]).toEqual({
        attempts: 1,
        events: [mockEventString],
        sequenceId: 3,
        sessionId: 123,
        timeout: 0,
      });
      // Sending second stored session events
      expect(send.mock.calls[1][0]).toEqual({
        attempts: 1,
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 456,
        timeout: 0,
      });

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1]({})).toEqual({
        '456': {
          events: [],
          sequenceId: 2,
        },
      });
    });
    test('should handle no stored events', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
      };
      const mockGetResolution = Promise.resolve({});
      get.mockReturnValueOnce(mockGetResolution);
      await sessionReplay.setup(config);
      await mockGetResolution;
      expect(sessionReplay.currentSequenceId).toBe(0);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1]({})).toEqual({
        '123': {
          events: [],
          sequenceId: 0,
        },
      });
    });
    test('should record events', async () => {
      const mockGetResolution = Promise.resolve({});
      get.mockReturnValueOnce(mockGetResolution);
      const sessionReplay = sessionReplayPlugin();
      await sessionReplay.setup(mockConfig);
      await mockGetResolution;
      jest.runAllTimers();
      expect(record).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute', () => {
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
    test('should send the first emitted event immediately', () => {
      const sessionReplay = sessionReplayPlugin();
      const send = jest.spyOn(sessionReplay, 'send').mockReturnValueOnce(Promise.resolve());
      sessionReplay.config = mockConfig;
      sessionReplay.recordEvents();
      expect(sessionReplay.events).toEqual([]);
      const recordArg = record.mock.calls[0][0];
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sessionReplay.events).toEqual([]);
      jest.runAllTimers();
      // Should not store events in IDB
      expect(update).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toEqual({
        events: [mockEventString],
        sequenceId: 0,
        attempts: 1,
        timeout: 0,
        sessionId: 123,
      });
    });

    test('should store events in class and in IDB', () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      sessionReplay.recordEvents();
      expect(sessionReplay.events).toEqual([]);
      const recordArg = record.mock.calls[0][0];
      // Emit first event, which gets sent immediately
      recordArg?.emit && recordArg?.emit(mockEvent);
      // Emit second event, which is stored in class and IDB
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sessionReplay.events).toEqual([mockEventString]);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1]({})).toEqual({
        123: {
          events: [mockEventString],
          sequenceId: 1,
        },
      });
    });

    test('should split the events list at an increasing interval and send', () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      sessionReplay.recordEvents();
      sessionReplay.timeSinceLastSend = 1;
      const dateNowMock = jest.spyOn(Date, 'now').mockReturnValue(1);
      const sendEventsList = jest.spyOn(sessionReplay, 'sendEventsList');
      const recordArg = record.mock.calls[0][0];
      // Emit first event, which gets sent immediately
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sendEventsList).toHaveBeenCalledTimes(1);
      sendEventsList.mockClear();
      // Emit second event, which is not sent immediately
      console.log('before second event');
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sendEventsList).toHaveBeenCalledTimes(0);
      // Emit third event and advance timers to interval
      dateNowMock.mockReturnValue(1002);
      recordArg?.emit && recordArg?.emit(mockEvent);
      expect(sendEventsList).toHaveBeenCalledTimes(1);
      expect(sendEventsList).toHaveBeenCalledWith({
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
      });
      expect(sessionReplay.events).toEqual([mockEventString]);
      dateNowMock.mockClear();
    });

    test('should split the events list at max size and send', () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      sessionReplay.maxPersistedEventsSize = 20;
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
          events: [mockEventString],
          sequenceId: 1,
        },
      });
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
    test('should remove session events from IDB store upon success', async () => {
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
      jest.runAllTimers();
      const mockIDBStore = {
        123: {
          events: [mockEventString],
          sequenceId: 3,
        },
        456: {
          events: [mockEventString],
          sequenceId: 1,
        },
      };

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        456: {
          events: [mockEventString],
          sequenceId: 1,
        },
      });
    });
    test('should not remove session events from IDB store upon failure', async () => {
      const sessionReplay = sessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        attempts: 0,
        timeout: 0,
      };
      (global.fetch as jest.Mock).mockImplementationOnce(() => Promise.reject());

      await sessionReplay.send(context);
      jest.runAllTimers();

      expect(update).not.toHaveBeenCalled();
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
    test('should handle unexpected error', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        loggerProvider: mockLoggerProvider,
      };
      (fetch as jest.Mock).mockImplementationOnce(() => Promise.reject('API Failure'));
      await sessionReplay.setup(config);
      await sessionReplay.execute({
        event_type: 'session_end',
        session_id: 456,
      });
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(1);
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
      await sessionReplay.execute({
        event_type: 'session_end',
        session_id: 456,
      });
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(mockLoggerProvider.error).toHaveBeenCalledTimes(0);
      expect(mockLoggerProvider.log).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.log.mock.calls[0][0]).toEqual(SUCCESS_MESSAGE);
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
      const event = {
        event_type: 'session_end',
        session_id: 456,
      };
      await sessionReplay.execute(event);
      await runScheduleTimers();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mockLoggerProvider.error).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.error.mock.calls[0][0]).toEqual(UNEXPECTED_ERROR_MESSAGE);
    });
  });

  describe('idb error handling', () => {
    test('getAllSessionEventsFromStore should catch errors', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        loggerProvider: mockLoggerProvider,
      };
      sessionReplay.config = config;
      get.mockImplementationOnce(() => Promise.reject('error'));
      await sessionReplay.getAllSessionEventsFromStore();
      expect(mockLoggerProvider.error).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.error.mock.calls[0][0]).toEqual(
        'Failed to store session replay events in IndexedDB: error',
      );
    });
    test('storeEventsForSession should catch errors', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        loggerProvider: mockLoggerProvider,
      };
      sessionReplay.config = config;
      update.mockImplementationOnce(() => Promise.reject('error'));
      await sessionReplay.storeEventsForSession([mockEventString], 0);
      expect(mockLoggerProvider.error).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.error.mock.calls[0][0]).toEqual(
        'Failed to store session replay events in IndexedDB: error',
      );
    });
    test('removeSessionEventsStore should catch errors', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        loggerProvider: mockLoggerProvider,
      };
      sessionReplay.config = config;
      update.mockImplementationOnce(() => Promise.reject('error'));
      await sessionReplay.removeSessionEventsStore(123);
      expect(mockLoggerProvider.error).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockLoggerProvider.error.mock.calls[0][0]).toEqual(
        'Failed to store session replay events in IndexedDB: error',
      );
    });
    test('removeSessionEventsStore should handle an undefined store', async () => {
      const sessionReplay = sessionReplayPlugin();
      const config = {
        ...mockConfig,
        loggerProvider: mockLoggerProvider,
      };
      sessionReplay.config = config;
      update.mockImplementationOnce(() => Promise.resolve());
      await sessionReplay.removeSessionEventsStore(123);
      expect(update.mock.calls[0][1](undefined)).toEqual({});
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
      test('should return false if timeSinceLastSend is null', () => {
        const sessionReplay = sessionReplayPlugin();
        const nextEvent = 'a';
        const result = sessionReplay.shouldSplitEventsList(nextEvent);
        expect(result).toBe(false);
      });
      test('should return false if it has not been long enough since last send', () => {
        const sessionReplay = sessionReplayPlugin();
        sessionReplay.timeSinceLastSend = 1;
        jest.spyOn(Date, 'now').mockReturnValue(2);
        const nextEvent = 'a';
        const result = sessionReplay.shouldSplitEventsList(nextEvent);
        expect(result).toBe(false);
      });
      test('should return true if it has been long enough since last send', () => {
        const sessionReplay = sessionReplayPlugin();
        sessionReplay.timeSinceLastSend = 1;
        jest.spyOn(Date, 'now').mockReturnValue(1002);
        const nextEvent = 'a';
        const result = sessionReplay.shouldSplitEventsList(nextEvent);
        expect(result).toBe(true);
      });
      test('should increase interval incrementally', () => {
        const sessionReplay = sessionReplayPlugin();
        sessionReplay.timeSinceLastSend = 1;
        jest.spyOn(Date, 'now').mockReturnValue(1000000);
        const nextEvent = 'a';
        for (let i = 1; i <= 10; i++) {
          expect(sessionReplay.interval).toEqual(1000 * i);
          sessionReplay.shouldSplitEventsList(nextEvent);
        }
        // Call one more time to go over the 10 max
        sessionReplay.shouldSplitEventsList(nextEvent);
        expect(sessionReplay.interval).toEqual(10000);
      });
    });
  });
});
