import * as AnalyticsClientCommon from '@amplitude/analytics-client-common';
import { Logger, ServerZone } from '@amplitude/analytics-types';
import { SESSION_REPLAY_EU_URL, SESSION_REPLAY_SERVER_URL, SESSION_REPLAY_STAGING_URL } from '../src/constants';
import { SessionReplayTrackDestination } from '../src/track-destination';
import { VERSION } from '../src/version';

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
const apiKey = 'static_key';

describe('SessionReplayTrackDestination', () => {
  let originalFetch: typeof global.fetch;
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };
  const mockOnComplete = jest.fn();
  beforeEach(() => {
    jest.useFakeTimers();
    originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      Promise.resolve({
        status: 200,
      }),
    ) as jest.Mock;

    jest.spyOn(AnalyticsClientCommon, 'getGlobalScope').mockReturnValue({} as unknown as typeof globalThis);
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.spyOn(global.Math, 'random').mockRestore();
    global.fetch = originalFetch;
    jest.useRealTimers();
  });
  describe('addToQueue', () => {
    test('should add to queue and schedule a flush', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const schedule = jest.spyOn(trackDestination, 'schedule').mockReturnValueOnce(undefined);
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        onComplete: mockOnComplete,
        flushMaxRetries: 1,
      };
      trackDestination.addToQueue(context);
      expect(schedule).toHaveBeenCalledTimes(1);
      expect(schedule).toHaveBeenCalledWith(0);
      expect(context.attempts).toBe(1);
    });

    test('should not add to queue if attemps are greater than allowed retries', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const completeRequest = jest.spyOn(trackDestination, 'completeRequest').mockReturnValueOnce(undefined);
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        apiKey,
        attempts: 1,
        timeout: 0,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        onComplete: mockOnComplete,
      };
      trackDestination.addToQueue(context);
      expect(completeRequest).toHaveBeenCalledTimes(1);
      expect(completeRequest).toHaveBeenCalledWith({
        context: context,
        err: 'Session replay event batch rejected due to exceeded retry count, batch sequence id, 1',
      });
    });
  });

  describe('schedule', () => {
    test('should schedule a flush', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (trackDestination as any).scheduled = null;
      trackDestination.queue = [
        {
          events: [mockEventString],
          sequenceId: 1,
          sessionId: 123,
          apiKey,
          attempts: 0,
          timeout: 0,
          flushMaxRetries: 1,
          deviceId: '1a2b3c',
          sampleRate: 1,
          serverZone: ServerZone.US,
          onComplete: mockOnComplete,
        },
      ];
      const flush = jest
        .spyOn(trackDestination, 'flush')
        .mockImplementationOnce(() => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (trackDestination as any).scheduled = null;
          return Promise.resolve(undefined);
        })
        .mockReturnValueOnce(Promise.resolve(undefined));
      trackDestination.schedule(0);
      await runScheduleTimers();
      expect(flush).toHaveBeenCalledTimes(2);
    });

    test('should not schedule if one is already in progress', () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (trackDestination as any).scheduled = setTimeout(jest.fn, 0);
      const flush = jest.spyOn(trackDestination, 'flush').mockReturnValueOnce(Promise.resolve(undefined));
      trackDestination.schedule(0);
      expect(flush).toHaveBeenCalledTimes(0);
    });
  });

  describe('flush', () => {
    test('should call send', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      trackDestination.queue = [
        {
          events: [mockEventString],
          sequenceId: 1,
          sessionId: 123,
          apiKey,
          attempts: 0,
          timeout: 0,
          flushMaxRetries: 1,
          deviceId: '1a2b3c',
          sampleRate: 1,
          serverZone: ServerZone.US,
          onComplete: mockOnComplete,
        },
      ];
      const send = jest.spyOn(trackDestination, 'send').mockReturnValueOnce(Promise.resolve());
      const result = await trackDestination.flush();
      expect(trackDestination.queue).toEqual([]);
      expect(result).toBe(undefined);
      expect(send).toHaveBeenCalledTimes(1);
    });

    test('should send later', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 1000,
        flushMaxRetries: 1,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        onComplete: mockOnComplete,
      };
      trackDestination.queue = [context];
      const send = jest.spyOn(trackDestination, 'send').mockReturnValueOnce(Promise.resolve());
      const result = await trackDestination.flush();
      expect(trackDestination.queue).toEqual([context]);
      expect(result).toBe(undefined);
      expect(send).toHaveBeenCalledTimes(0);
    });
  });

  describe('getServerUrl', () => {
    test('should return us server url if no config set', () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      expect(trackDestination.getServerUrl()).toEqual(SESSION_REPLAY_SERVER_URL);
    });

    test('should return staging server url if staging config set', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      expect(trackDestination.getServerUrl(ServerZone.STAGING)).toEqual(SESSION_REPLAY_STAGING_URL);
    });

    test('should return eu server url if eu config set', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });

      expect(trackDestination.getServerUrl(ServerZone.EU)).toEqual(SESSION_REPLAY_EU_URL);
    });
  });

  describe('send', () => {
    test('should not send anything if api key not set', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      trackDestination.loggerProvider = mockLoggerProvider;
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        attempts: 0,
        timeout: 0,
        flushMaxRetries: 1,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        onComplete: mockOnComplete,
      };
      await trackDestination.send(context);
      expect(fetch).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });
    test('should not send anything if device id not set', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        deviceId: undefined,
        flushMaxRetries: 1,
        sampleRate: 1,
        serverZone: ServerZone.US,
        onComplete: mockOnComplete,
      };
      await trackDestination.send(context);
      expect(fetch).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });
    test('should make a request correctly', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        flushMaxRetries: 1,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        onComplete: mockOnComplete,
      };

      await trackDestination.send(context);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        'https://api-sr.amplitude.com/sessions/v2/track?device_id=1a2b3c&session_id=123&seq_number=1',
        {
          body: JSON.stringify({ version: 1, events: [mockEventString] }),
          headers: {
            Accept: '*/*',
            'Content-Type': 'application/json',
            Authorization: 'Bearer static_key',
            'X-Client-Sample-Rate': '1',
            'X-Client-Url': '',
            'X-Client-Version': VERSION,
          },
          method: 'POST',
        },
      );
    });
    test('should make a request to eu', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });

      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        serverZone: ServerZone.EU,
        flushMaxRetries: 1,
        deviceId: '1a2b3c',
        sampleRate: 1,
        onComplete: mockOnComplete,
      };

      await trackDestination.send(context);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        'https://api-sr.eu.amplitude.com/sessions/v2/track?device_id=1a2b3c&session_id=123&seq_number=1',
        {
          body: JSON.stringify({ version: 1, events: [mockEventString] }),
          headers: {
            Accept: '*/*',
            'Content-Type': 'application/json',
            Authorization: 'Bearer static_key',
            'X-Client-Sample-Rate': '1',
            'X-Client-Url': '',
            'X-Client-Version': VERSION,
          },
          method: 'POST',
        },
      );
    });

    test('should retry if retry param is true', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        flushMaxRetries: 1,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        onComplete: mockOnComplete,
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
      const addToQueue = jest.spyOn(trackDestination, 'addToQueue');

      await trackDestination.send(context, true);
      expect(addToQueue).toHaveBeenCalledTimes(1);
      expect(addToQueue).toHaveBeenCalledWith({
        ...context,
        attempts: 1,
        timeout: 0,
      });
      await runScheduleTimers();
    });

    test('should not retry if retry param is false', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const context = {
        events: [mockEventString],
        sequenceId: 1,
        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        flushMaxRetries: 1,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        onComplete: mockOnComplete,
      };
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          status: 500,
        }),
      );
      const addToQueue = jest.spyOn(trackDestination, 'addToQueue');

      await trackDestination.send(context, false);
      expect(addToQueue).toHaveBeenCalledTimes(0);
    });
  });
});
