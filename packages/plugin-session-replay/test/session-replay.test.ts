/* eslint-disable jest/expect-expect */
import { CookieStorage, FetchTransport } from '@amplitude/analytics-client-common';
import { BrowserConfig, LogLevel } from '@amplitude/analytics-types';
import * as IDBKeyVal from 'idb-keyval';
import * as RRWeb from 'rrweb';
import { SessionReplayPlugin } from '../src/session-replay';

jest.mock('idb-keyval');
type MockedIDBKeyVal = jest.Mocked<typeof import('idb-keyval')>;

jest.mock('rrweb');
type MockedRRWeb = jest.Mocked<typeof import('rrweb')>;

const mockEvent =
  '{"type":4,"data":{"href":"https://analytics.amplitude.com/","width":1728,"height":154},"timestamp":1687358660935}';

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
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup(mockConfig);
      expect(sessionReplay.config.transportProvider).toBeDefined();
      expect(sessionReplay.config.serverUrl).toBe('url');
      expect(sessionReplay.config.flushMaxRetries).toBe(1);
      expect(sessionReplay.config.flushQueueSize).toBe(0);
      expect(sessionReplay.config.flushIntervalMillis).toBe(0);
      expect(sessionReplay.storageKey).toBe('AMP_replay_unsent_static_key');
    });

    // polluting fetch
    test('should read events from storage and send them, then reset storage for session', async () => {
      const sessionReplay = new SessionReplayPlugin();
      mockConfig.sessionId = 456;
      get.mockResolvedValueOnce({
        123: {
          events: [mockEvent],
          sequenceId: 3,
        },
        456: {
          events: [mockEvent],
          sequenceId: 1,
        },
      });
      const send = jest.spyOn(sessionReplay, 'send').mockReturnValueOnce(Promise.resolve());

      await sessionReplay.setup(mockConfig);
      jest.runAllTimers();
      expect(send).toHaveBeenCalledTimes(2);

      // Sending first stored session events
      expect(send.mock.calls[0][0]).toEqual({
        attempts: 1,
        events: [mockEvent],
        sequenceId: 3,
        sessionId: 123,
        timeout: 0,
      });
      // Sending second stored session events
      expect(send.mock.calls[1][0]).toEqual({
        attempts: 1,
        events: [mockEvent],
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
    test('should record events', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup(mockConfig);
      jest.runAllTimers();
      expect(record).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute', () => {
    test('should add event property for session_replay_enabled', async () => {
      const sessionReplay = new SessionReplayPlugin();
      await sessionReplay.setup(mockConfig);
      const event = {
        event_type: 'event_type',
        event_properties: {
          property_a: true,
          property_b: 123,
        },
      };

      const enrichedEvent = await sessionReplay.execute(event);
      expect(enrichedEvent.event_properties).toEqual({
        property_a: true,
        property_b: 123,
        session_replay_enabled: true,
      });
    });

    test('should restart recording events when session_start fires', async () => {
      const sessionReplay = new SessionReplayPlugin();
      const mockStopRecordingEvents = jest.fn();
      record.mockReturnValue(mockStopRecordingEvents);
      await sessionReplay.setup(mockConfig);
      jest.runAllTimers();
      const event = {
        event_type: 'session_start',
      };
      await sessionReplay.execute(event);
      expect(mockStopRecordingEvents).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledTimes(2);
    });

    test('should send the current events list when session_end fires', async () => {
      const sessionReplay = new SessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const send = jest.spyOn(sessionReplay, 'send').mockReturnValueOnce(Promise.resolve());

      const event = {
        event_type: 'session_end',
        session_id: 789,
      };
      sessionReplay.events = [mockEvent];
      await sessionReplay.execute(event);
      jest.runAllTimers();
      expect(send).toHaveBeenCalledTimes(1);

      // Sending first stored session events
      expect(send.mock.calls[0][0]).toEqual({
        attempts: 1,
        events: [mockEvent],
        sequenceId: 0,
        sessionId: 789,
        timeout: 0,
      });
    });
  });

  describe('addToQueue', () => {
    test('should add to queue and schedule a flush', () => {
      const sessionReplay = new SessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const schedule = jest.spyOn(sessionReplay, 'schedule').mockReturnValueOnce(undefined);
      const context = {
        events: [mockEvent],
        sequenceId: 1,
        sessionId: 123,
        attempts: 0,
        timeout: 0,
      };
      sessionReplay.addToQueue(context);
      expect(schedule).toHaveBeenCalledTimes(1);
      expect(context.attempts).toBe(1);
    });
  });

  describe('schedule', () => {
    test('should schedule a flush', async () => {
      const sessionReplay = new SessionReplayPlugin();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (sessionReplay as any).scheduled = null;
      sessionReplay.queue = [
        {
          events: [mockEvent],
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
      const sessionReplay = new SessionReplayPlugin();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (sessionReplay as any).scheduled = setTimeout(jest.fn, 0);
      const flush = jest.spyOn(sessionReplay, 'flush').mockReturnValueOnce(Promise.resolve(undefined));
      sessionReplay.schedule(0);
      expect(flush).toHaveBeenCalledTimes(0);
    });
  });

  describe('flush', () => {
    test('should call send', async () => {
      const sessionReplay = new SessionReplayPlugin();
      sessionReplay.config = mockConfig;
      sessionReplay.queue = [
        {
          events: [mockEvent],
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
      const sessionReplay = new SessionReplayPlugin();
      sessionReplay.config = mockConfig;
      sessionReplay.queue = [
        {
          events: [mockEvent],
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
          events: [mockEvent],
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
      const sessionReplay = new SessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const context = {
        events: [mockEvent],
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
          events_batch: { version: 1, events: [mockEvent], seq_number: 1 },
        }),
        headers: { Accept: '*/*', 'Content-Type': 'application/json' },
        method: 'POST',
      });
    });
    test('should remove session events from IDB store upon success', async () => {
      const sessionReplay = new SessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const context = {
        events: [mockEvent],
        sequenceId: 1,
        sessionId: 123,
        attempts: 0,
        timeout: 0,
      };
      await sessionReplay.send(context);
      jest.runAllTimers();
      const mockIDBStore = {
        123: {
          events: [mockEvent],
          sequenceId: 3,
        },
        456: {
          events: [mockEvent],
          sequenceId: 1,
        },
      };

      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][1](mockIDBStore)).toEqual({
        456: {
          events: [mockEvent],
          sequenceId: 1,
        },
      });
    });
    test('should not remove session events from IDB store upon failure', async () => {
      const sessionReplay = new SessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const context = {
        events: [mockEvent],
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
      const sessionReplay = new SessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const context = {
        events: [mockEvent],
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
      const sessionReplay = new SessionReplayPlugin();
      sessionReplay.config = mockConfig;
      const context = {
        events: [mockEvent],
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
    const mockLoggerProvider = {
      error: jest.fn(),
      log: jest.fn(),
      logLevel: 1,
      disable: jest.fn(),
      enable: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };
    test('should handle unexpected error', async () => {
      const sessionReplay = new SessionReplayPlugin();
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
      const sessionReplay = new SessionReplayPlugin();
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
      expect(mockLoggerProvider.log.mock.calls[0][0]).toEqual('Session Replay events tracked successfully');
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
      const sessionReplay = new SessionReplayPlugin();
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
      const sessionReplay = new SessionReplayPlugin();
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
      const sessionReplay = new SessionReplayPlugin();
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
  });
});
