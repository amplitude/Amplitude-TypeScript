import * as AnalyticsCore from '@amplitude/analytics-core';
import { ILogger, ServerZone } from '@amplitude/analytics-core';
import { SessionReplayDestinationContext } from 'src/typings/session-replay';
import { MERGE_AFTER_THROTTLE_SOFT_CAP } from '../src/constants';
import { SessionReplayTrackDestination } from '../src/track-destination';
import { SEND_TIMEOUT_MS } from '../src/constants';
import { VERSION } from '../src/version';

type MockedLogger = jest.Mocked<ILogger>;
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

    jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({} as unknown as typeof globalThis);
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
      const context: SessionReplayDestinationContext = {
        events: [mockEventString],

        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
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
      const context: SessionReplayDestinationContext = {
        events: [mockEventString],

        sessionId: 123,
        apiKey,
        attempts: 1,
        timeout: 0,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
        onComplete: mockOnComplete,
      };
      trackDestination.addToQueue(context);
      expect(completeRequest).toHaveBeenCalledTimes(1);
      expect(completeRequest).toHaveBeenCalledWith({
        context: context,
        err: 'Session replay event batch rejected due to exceeded retry count',
      });
    });

    test('should not add a duplicate sequence to the queue', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const schedule = jest.spyOn(trackDestination, 'schedule').mockReturnValueOnce(undefined);
      const context: SessionReplayDestinationContext = {
        events: [mockEventString],

        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
        onComplete: mockOnComplete,
        flushMaxRetries: 1,
      };
      trackDestination.addToQueue(context);
      // Add the same context a second time
      trackDestination.addToQueue(context);
      expect(schedule).toHaveBeenCalledTimes(1);
      expect(trackDestination.queue).toEqual([context]);
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

          sessionId: 123,
          apiKey,
          attempts: 0,
          timeout: 0,
          flushMaxRetries: 1,
          deviceId: '1a2b3c',
          sampleRate: 1,
          serverZone: ServerZone.US,
          type: 'replay',
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

          sessionId: 123,
          apiKey,
          attempts: 0,
          timeout: 0,
          flushMaxRetries: 1,
          deviceId: '1a2b3c',
          sampleRate: 1,
          serverZone: ServerZone.US,
          type: 'replay',
          onComplete: mockOnComplete,
        },
      ];
      const send = jest.spyOn(trackDestination, 'send').mockReturnValueOnce(Promise.resolve());
      const result = await trackDestination.flush();
      expect(trackDestination.queue).toEqual([]);
      expect(result).toBe(undefined);
      expect(send).toHaveBeenCalledTimes(1);
    });

    test('should send batches sequentially in order', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });

      const sendOrder: number[] = [];
      let resolveFirst!: () => void;

      jest
        .spyOn(trackDestination, 'send')
        .mockImplementationOnce(() => {
          sendOrder.push(1);
          return new Promise<void>((resolve) => {
            resolveFirst = resolve;
          });
        })
        .mockImplementationOnce(() => {
          sendOrder.push(2);
          return Promise.resolve();
        });

      trackDestination.queue = [
        {
          events: [mockEventString],
          sessionId: 1,
          apiKey,
          attempts: 0,
          timeout: 0,
          flushMaxRetries: 1,
          deviceId: '1a2b3c',
          sampleRate: 1,
          serverZone: ServerZone.US,
          type: 'replay',
          onComplete: mockOnComplete,
        },
        {
          events: [mockEventString],
          sessionId: 2,
          apiKey,
          attempts: 0,
          timeout: 0,
          flushMaxRetries: 1,
          deviceId: '1a2b3c',
          sampleRate: 1,
          serverZone: ServerZone.US,
          type: 'replay',
          onComplete: mockOnComplete,
        },
      ];

      const flushPromise = trackDestination.flush();

      // First send should have started; second should not have started yet
      expect(sendOrder).toEqual([1]);

      resolveFirst();
      await flushPromise;

      expect(sendOrder).toEqual([1, 2]);
    });
  });

  describe('send', () => {
    test('should not send anything if no events present', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      trackDestination.loggerProvider = mockLoggerProvider;
      const context: SessionReplayDestinationContext = {
        events: [],

        sessionId: 123,
        attempts: 0,
        timeout: 0,
        flushMaxRetries: 1,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
        apiKey,
        onComplete: mockOnComplete,
      };
      await trackDestination.send(context);
      expect(fetch).not.toHaveBeenCalled();
    });
    // SR-4284: defensive belt-and-braces guard immediately before fetch. The send()
    // post-batcher check at the top is the primary line of defense, but a payloadBatcher
    // that strips events to zero AFTER that check (or any future regression) must still
    // not produce an empty-body POST. We invoke sendOnMainThread directly with an empty
    // payload to exercise the literal pre-fetch guard rather than the upstream check.
    test('pre-fetch guard skips fetch when payload events array is empty', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const context: SessionReplayDestinationContext = {
        events: [mockEventString],
        sessionId: 123,
        attempts: 0,
        timeout: 0,
        flushMaxRetries: 1,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
        apiKey,
        onComplete: mockOnComplete,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (trackDestination as any).sendOnMainThread(apiKey, '1a2b3c', context, { version: 1, events: [] }, false);
      expect(fetch).not.toHaveBeenCalled();
      expect(mockOnComplete).toHaveBeenCalled();
    });
    test('should not send anything if api key not set', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      trackDestination.loggerProvider = mockLoggerProvider;
      const context: SessionReplayDestinationContext = {
        events: [mockEventString],

        sessionId: 123,
        attempts: 0,
        timeout: 0,
        flushMaxRetries: 1,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
        onComplete: mockOnComplete,
      };
      await trackDestination.send(context);
      expect(fetch).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });
    test('should not send anything if device id not set', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const context: SessionReplayDestinationContext = {
        events: [mockEventString],

        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        deviceId: undefined,
        flushMaxRetries: 1,
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
        onComplete: mockOnComplete,
      };
      await trackDestination.send(context);
      expect(fetch).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalled();
    });
    test('should make a request correctly', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const context: SessionReplayDestinationContext = {
        events: [mockEventString],

        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        flushMaxRetries: 1,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
        onComplete: mockOnComplete,
        version: {
          type: 'plugin',
          version: VERSION,
        },
      };

      await trackDestination.send(context);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        'https://api-sr.amplitude.com/sessions/v2/track?device_id=1a2b3c&session_id=123&type=replay',
        {
          body: JSON.stringify({ version: 1, events: [mockEventString] }),
          headers: {
            Accept: '*/*',
            'Content-Type': 'application/json',
            Authorization: 'Bearer static_key',
            'X-Client-Library': `plugin/${VERSION}`,
            'X-Client-Sample-Rate': '1',
            'X-Sampling-Hash-Alg': 'xxhash32',
            'X-Client-Url': '',
            'X-Client-Version': VERSION,
          },
          method: 'POST',
          keepalive: true,
          signal: expect.any(AbortSignal),
        },
      );
    });
    test('should make a request to eu', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });

      const context: SessionReplayDestinationContext = {
        events: [mockEventString],

        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        serverZone: ServerZone.EU,
        flushMaxRetries: 1,
        deviceId: '1a2b3c',
        sampleRate: 1,
        type: 'replay',
        onComplete: mockOnComplete,
      };

      await trackDestination.send(context);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        'https://api-sr.eu.amplitude.com/sessions/v2/track?device_id=1a2b3c&session_id=123&type=replay',
        {
          body: JSON.stringify({ version: 1, events: [mockEventString] }),
          headers: {
            Accept: '*/*',
            'Content-Type': 'application/json',
            Authorization: 'Bearer static_key',
            'X-Client-Library': `standalone/${VERSION}`,
            'X-Client-Sample-Rate': '1',
            'X-Sampling-Hash-Alg': 'xxhash32',
            'X-Client-Url': '',
            'X-Client-Version': VERSION,
          },
          method: 'POST',
          keepalive: true,
          signal: expect.any(AbortSignal),
        },
      );
    });

    test('should retry if retry param is true', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const context: SessionReplayDestinationContext = {
        events: [mockEventString],

        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        flushMaxRetries: 2,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
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

      const sendPromise = trackDestination.send(context, true);
      await jest.runAllTimersAsync();
      await sendPromise;

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    test.each([408, 429, 499])('should retry on %i', async (statusCode) => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const context: SessionReplayDestinationContext = {
        events: [mockEventString],
        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        flushMaxRetries: 2,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
        onComplete: mockOnComplete,
      };
      (global.fetch as jest.Mock)
        .mockImplementationOnce(() => Promise.resolve({ status: statusCode }))
        .mockImplementationOnce(() => Promise.resolve({ status: 200 }));

      const sendPromise = trackDestination.send(context, true);
      await jest.runAllTimersAsync();
      await sendPromise;

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('should not retry if retry param is false', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const context: SessionReplayDestinationContext = {
        events: [mockEventString],

        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        flushMaxRetries: 1,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
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

  describe('send timeout (AbortController)', () => {
    const timeoutContext = (
      overrides: Partial<SessionReplayDestinationContext> = {},
    ): SessionReplayDestinationContext => ({
      events: [mockEventString],
      sessionId: 123,
      apiKey,
      attempts: 0,
      timeout: 0,
      flushMaxRetries: 2,
      deviceId: '1a2b3c',
      sampleRate: 1,
      serverZone: ServerZone.US,
      type: 'replay',
      onComplete: mockOnComplete,
      ...overrides,
    });

    // A fetch that never settles on its own — it only rejects when its AbortSignal fires,
    // simulating a request stuck "pending" forever until our timeout aborts it. The rejection
    // mirrors the real browser behavior: an Error whose name is 'AbortError'.
    const abortError = () => {
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      return e;
    };
    const hangUntilAborted = () =>
      jest.fn((_url: string, options: RequestInit) => {
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(abortError()));
        });
      });

    test('timeout fires and triggers a retry when useRetry=true', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      (global.fetch as jest.Mock)
        .mockImplementationOnce(hangUntilAborted())
        .mockImplementationOnce(() => Promise.resolve({ status: 200 }));

      const sendPromise = trackDestination.send(timeoutContext(), true);
      // Drains the abort timer (rejects fetch), then the retry backoff timer and the
      // successful second send.
      await jest.runAllTimersAsync();
      await sendPromise;

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('timeout with useRetry=false completes with error and does not retry', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const addToQueue = jest.spyOn(trackDestination, 'addToQueue');
      (global.fetch as jest.Mock).mockImplementationOnce(hangUntilAborted());

      const sendPromise = trackDestination.send(timeoutContext(), false);
      await jest.runAllTimersAsync();
      await sendPromise;

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(addToQueue).not.toHaveBeenCalled();
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });

    test('timer is cleared on normal completion so no stray abort fires', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const clearSpy = jest.spyOn(global, 'clearTimeout');
      (global.fetch as jest.Mock).mockImplementationOnce(() => Promise.resolve({ status: 200 }));

      await trackDestination.send(timeoutContext(), false);
      // The send timeout must have been cleared in the finally block on the success path.
      expect(clearSpy).toHaveBeenCalled();

      // Advancing past the timeout window must not fire a stray abort/warn or re-complete.
      jest.advanceTimersByTime(SEND_TIMEOUT_MS + 1);
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });

    test('arms the abort timer at the configured sendTimeoutMs instead of the default', async () => {
      const setSpy = jest.spyOn(global, 'setTimeout');
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        sendTimeoutMs: 30_000,
      });
      (global.fetch as jest.Mock)
        .mockImplementationOnce(hangUntilAborted())
        .mockImplementationOnce(() => Promise.resolve({ status: 200 }));

      const sendPromise = trackDestination.send(timeoutContext(), true);
      await jest.runAllTimersAsync();
      await sendPromise;

      // The abort must be scheduled at the configured value, not SEND_TIMEOUT_MS.
      expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
      // And it still aborts → retries to the successful second attempt.
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('sendTimeoutMs of 0 disables the abort: a slow request is not aborted past the default window', async () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        sendTimeoutMs: 0,
      });
      // Succeeds on its own well after the default timeout would have aborted it.
      const slowSuccess = jest.fn(
        (_url: string, options: RequestInit) =>
          new Promise((resolve, reject) => {
            options.signal?.addEventListener('abort', () => reject(abortError()));
            setTimeout(() => resolve({ status: 200 } as Response), SEND_TIMEOUT_MS * 2);
          }),
      );
      (global.fetch as jest.Mock).mockImplementationOnce(slowSuccess);

      const sendPromise = trackDestination.send(timeoutContext(), true);
      await jest.runAllTimersAsync();
      await sendPromise;

      // No abort-triggered retry — the single slow request completed successfully.
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });

    test('a non-abort fetch rejection completes with error and does not retry even when useRetry=true', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const handleOther = jest.spyOn(trackDestination, 'handleOtherResponse');
      // A plain network Error (not an AbortError) must keep the original complete-with-error
      // behavior rather than being misrouted through the timeout retry path.
      (global.fetch as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('boom')));

      const sendPromise = trackDestination.send(timeoutContext(), true);
      await jest.runAllTimersAsync();
      await sendPromise;

      expect(handleOther).not.toHaveBeenCalled();
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(expect.any(Error));
    });

    test('a DOMException abort (not an Error instance) is still retried when useRetry=true', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const handleOther = jest.spyOn(trackDestination, 'handleOtherResponse');
      // Real browsers reject an aborted fetch with a DOMException named 'AbortError', which is
      // NOT an Error instance — the retry path must still trigger instead of completing fatally.
      (global.fetch as jest.Mock)
        .mockImplementationOnce(
          (_url: string, options: RequestInit) =>
            new Promise((_resolve, reject) => {
              options.signal?.addEventListener('abort', () => reject({ name: 'AbortError', message: 'aborted' }));
            }),
        )
        .mockImplementationOnce(() => Promise.resolve({ status: 200 }));

      const sendPromise = trackDestination.send(timeoutContext(), true);
      await jest.runAllTimersAsync();
      await sendPromise;

      expect(handleOther).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('keepalive', () => {
    test('sets keepalive true for small payloads', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const context: SessionReplayDestinationContext = {
        events: [mockEventString],
        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        flushMaxRetries: 1,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
        onComplete: mockOnComplete,
      };
      await trackDestination.send(context);
      const options = (fetch as jest.Mock).mock.calls[0][1] as RequestInit;
      expect(options.keepalive).toBe(true);
    });

    test('sets keepalive false when uncompressed payload exceeds 64 KB', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      // ~66 KB of event data
      const bigEvent = 'x'.repeat(66 * 1024);
      const context: SessionReplayDestinationContext = {
        events: [bigEvent],
        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        flushMaxRetries: 1,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
        onComplete: mockOnComplete,
      };
      await trackDestination.send(context);
      const options = (fetch as jest.Mock).mock.calls[0][1] as RequestInit;
      expect(options.keepalive).toBe(false);
    });
  });

  describe('gzip compression', () => {
    const makeContext = (): SessionReplayDestinationContext => ({
      events: [mockEventString],
      sessionId: 123,
      apiKey,
      attempts: 0,
      timeout: 0,
      flushMaxRetries: 1,
      deviceId: '1a2b3c',
      sampleRate: 1,
      serverZone: ServerZone.US,
      type: 'replay',
      onComplete: mockOnComplete,
    });

    test('should send with Content-Encoding: gzip when CompressionStream is available', async () => {
      const mockCompressed = new Uint8Array([0x1f, 0x8b]); // minimal gzip magic bytes

      // Mock a CompressionStream that returns a compressed chunk
      const mockWriter = { write: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
      const mockReader = {
        read: jest
          .fn()
          .mockResolvedValueOnce({ done: false, value: mockCompressed })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };
      class MockCompressionStream {
        writable = { getWriter: () => mockWriter };
        readable = { getReader: () => mockReader };
      }
      // Override getGlobalScope to expose CompressionStream
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
        CompressionStream: MockCompressionStream,
      } as unknown as typeof globalThis);

      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      await trackDestination.send(makeContext());

      expect(fetch).toHaveBeenCalledTimes(1);
      const options = (fetch as jest.Mock).mock.calls[0][1] as RequestInit;
      expect((options.headers as Record<string, string>)['Content-Encoding']).toBe('gzip');
      expect(options.body).toEqual(mockCompressed);
    });

    test('should send without Content-Encoding when CompressionStream throws', async () => {
      class BrokenCompressionStream {
        constructor() {
          throw new Error('not supported');
        }
      }
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
        CompressionStream: BrokenCompressionStream,
      } as unknown as typeof globalThis);

      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      await trackDestination.send(makeContext());

      const options = (fetch as jest.Mock).mock.calls[0][1] as RequestInit;
      expect((options.headers as Record<string, string>)['Content-Encoding']).toBeUndefined();
      expect(typeof options.body).toBe('string');
    });

    test('should send uncompressed when enableTransportCompression is false even if CompressionStream is available', async () => {
      // Reach into CompressionStream to fail the test if the opt-out path falls through:
      // if the gate is broken, the constructor will throw and a different code path will
      // run, so this lets us assert that we never even touched CompressionStream.
      const cs = jest.fn();
      class FailIfConstructed {
        constructor() {
          cs();
          throw new Error('CompressionStream should not be constructed when opted out');
        }
      }
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
        CompressionStream: FailIfConstructed,
      } as unknown as typeof globalThis);

      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        enableTransportCompression: false,
      });
      await trackDestination.send(makeContext());

      expect(cs).not.toHaveBeenCalled();
      const options = (fetch as jest.Mock).mock.calls[0][1] as RequestInit;
      expect((options.headers as Record<string, string>)['Content-Encoding']).toBeUndefined();
      expect(typeof options.body).toBe('string');
    });
  });

  describe('handleReponse', () => {
    test('handles 413 without responseBody argument (uses default empty string)', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const handlePayloadTooLarge = jest
        .spyOn(trackDestination, 'handlePayloadTooLargeResponse')
        .mockReturnValueOnce(undefined);
      const context: SessionReplayDestinationContext = {
        events: [mockEventString],
        sessionId: 123,
        apiKey,
        attempts: 1,
        timeout: 0,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
        onComplete: mockOnComplete,
      };
      // Call without the optional responseBody argument to exercise the default
      await trackDestination.handleReponse(413, context);
      expect(handlePayloadTooLarge).toHaveBeenCalledWith(context, false);
    });
  });

  describe('handleOtherResponse', () => {
    test('should complete request when flushMaxRetries is not set', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const completeRequest = jest.spyOn(trackDestination, 'completeRequest').mockReturnValueOnce(undefined);
      const context: SessionReplayDestinationContext = {
        events: [mockEventString],
        sessionId: 123,
        apiKey,
        attempts: 1,
        timeout: 0,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
        onComplete: mockOnComplete,
      };
      await trackDestination.handleOtherResponse(context);
      expect(completeRequest).toHaveBeenCalledWith({
        context,
        err: 'Session replay event batch rejected due to exceeded retry count',
      });
    });
  });

  describe('handlePayloadTooLargeResponse', () => {
    const baseContext = (overrides = {}): SessionReplayDestinationContext => ({
      events: [mockEventString],
      sessionId: 123,
      apiKey,
      attempts: 1,
      timeout: 0,
      deviceId: '1a2b3c',
      sampleRate: 1,
      serverZone: ServerZone.US,
      type: 'replay',
      onComplete: mockOnComplete,
      ...overrides,
    });

    test('drops non-WAF batch immediately without bisecting', () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const completeRequest = jest.spyOn(trackDestination, 'completeRequest').mockReturnValueOnce(undefined);
      const sendEventsList = jest.spyOn(trackDestination, 'sendEventsList');
      const context = baseContext({ events: ['event1', 'event2'] });

      trackDestination.handlePayloadTooLargeResponse(context, false);

      expect(completeRequest).toHaveBeenCalledWith({
        context,
        err: expect.stringContaining('not retrying non-WAF 413'),
      });
      expect(sendEventsList).not.toHaveBeenCalled();
    });

    test('drops single WAF event and logs error with size', () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const completeRequest = jest.spyOn(trackDestination, 'completeRequest').mockReturnValueOnce(undefined);
      const context = baseContext();

      trackDestination.handlePayloadTooLargeResponse(context, true);

      expect(completeRequest).toHaveBeenCalledWith({
        context,
        err: expect.stringContaining('single event'),
      });
      expect(completeRequest.mock.calls[0][0].err).toContain('cannot split further');
    });

    test('names WAF as source when isWaf is true', () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      jest.spyOn(trackDestination, 'completeRequest').mockReturnValueOnce(undefined);
      const context = baseContext();

      trackDestination.handlePayloadTooLargeResponse(context, true);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      const errArg = (trackDestination.completeRequest as jest.Mock).mock.calls[0][0].err as string;
      expect(errArg).toContain('WAF');
    });

    test('bisects multi-event WAF batch and re-enqueues both halves', () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const capturedOnCompletes: Array<() => Promise<void>> = [];
      jest.spyOn(trackDestination, 'sendEventsList').mockImplementation((dest) => {
        capturedOnCompletes.push(dest.onComplete);
      });
      const context = baseContext({ events: ['event1', 'event2', 'event3', 'event4'] });

      trackDestination.handlePayloadTooLargeResponse(context, true);

      expect((trackDestination.sendEventsList as jest.Mock).mock.calls).toHaveLength(2);
      expect((trackDestination.sendEventsList as jest.Mock).mock.calls[0][0].events).toEqual(['event1', 'event2']);
      expect((trackDestination.sendEventsList as jest.Mock).mock.calls[1][0].events).toEqual(['event3', 'event4']);
      expect(mockOnComplete).toHaveBeenCalledTimes(1);
      // The noop onComplete passed to each half must be callable
      expect(capturedOnCompletes).toHaveLength(2);
      void Promise.all(capturedOnCompletes.map((fn) => fn()));
    });

    test('logs warn with event count and size when bisecting WAF batch', () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      jest.spyOn(trackDestination, 'sendEventsList').mockReturnValue(undefined);
      const context = baseContext({ events: ['event1', 'event2'] });

      trackDestination.handlePayloadTooLargeResponse(context, true);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(expect.stringContaining('splitting'));
    });
  });

  describe('server back-pressure (X-Session-Replay-Event-Skipped header)', () => {
    const baseDirectiveContext = (
      overrides: Partial<SessionReplayDestinationContext> = {},
    ): SessionReplayDestinationContext => ({
      events: [mockEventString],
      sessionId: 123,
      apiKey,
      attempts: 0,
      timeout: 0,
      flushMaxRetries: 1,
      deviceId: '1a2b3c',
      sampleRate: 1,
      serverZone: ServerZone.US,
      type: 'replay',
      onComplete: mockOnComplete,
      ...overrides,
    });

    const mockFetchWithHeader = (status: number, headerValue: string | null) => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        status,
        headers: { get: jest.fn().mockReturnValue(headerValue) },
      });
    };

    test('throttled (429) header pauses next flush by 60s', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      mockFetchWithHeader(200, '429');

      jest.setSystemTime(1_000_000);
      await trackDestination.send(baseDirectiveContext(), true);

      // Internal state set: flushPauseUntilMs ~ now + 60_000
      expect((trackDestination as any).flushPauseUntilMs).toBe(1_000_000 + 60_000);
    });

    test('clean 200 (no skip header) clears any prior throttle pause', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      (trackDestination as any).flushPauseUntilMs = Date.now() + 60_000;
      mockFetchWithHeader(200, null);

      await trackDestination.send(baseDirectiveContext(), true);

      expect((trackDestination as any).flushPauseUntilMs).toBe(0);
    });

    test('schedule defers next flush by remaining pause when throttled', () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      jest.setSystemTime(2_000_000);
      (trackDestination as any).flushPauseUntilMs = 2_000_000 + 30_000; // 30s remaining
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      trackDestination.schedule(0);

      // The schedule should use the remaining-pause as effective timeout, not the requested 0.
      const recordedTimeout = setTimeoutSpy.mock.calls[0][1] as number;
      expect(recordedTimeout).toBe(30_000);
    });

    test('schedule keeps requested timeout when no pause is active', () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      trackDestination.schedule(500);

      const recordedTimeout = setTimeoutSpy.mock.calls[0][1] as number;
      expect(recordedTimeout).toBe(500);
    });

    test.each([
      ['4004', 'session_in_invalid_range'],
      ['4005', 'capture_disabled'],
    ])('header %s (%s) hard-kills the session — drops queued contexts and future adds', async (code) => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      mockFetchWithHeader(200, code);

      const context = baseDirectiveContext({ sessionId: 555 });
      await trackDestination.send(context, true);

      expect((trackDestination as any).killedSessions.has(555)).toBe(true);

      // Queued contexts for the killed session are drained on add (never flushed).
      const followUpOnComplete = jest.fn().mockResolvedValue(undefined);
      const followUp = baseDirectiveContext({ sessionId: 555, onComplete: followUpOnComplete });
      trackDestination.addToQueue(followUp);

      expect(trackDestination.queue).toEqual([]);
      expect(followUpOnComplete).toHaveBeenCalled();
    });

    test('hard-kill drains contexts already enqueued for that session, leaves others alone', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });

      const killedSessionOnComplete = jest.fn().mockResolvedValue(undefined);
      const otherSessionOnComplete = jest.fn().mockResolvedValue(undefined);
      const queuedKilled = baseDirectiveContext({ sessionId: 999, onComplete: killedSessionOnComplete });
      const queuedOther = baseDirectiveContext({ sessionId: 1000, onComplete: otherSessionOnComplete });
      trackDestination.queue = [queuedKilled, queuedOther];

      mockFetchWithHeader(200, '4005');
      await trackDestination.send(baseDirectiveContext({ sessionId: 999 }), true);

      expect(killedSessionOnComplete).toHaveBeenCalled();
      expect(otherSessionOnComplete).not.toHaveBeenCalled();
      expect(trackDestination.queue).toEqual([queuedOther]);
    });

    test('killing a session is idempotent (re-killing the same session is a no-op)', () => {
      // killSession() can be reached twice for the same session if a worker request
      // that started before the kill completes after — its skipCode loops through
      // applyServerDirective again. The early-return guards against re-draining and
      // re-logging in that case.
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      (trackDestination as any).killSession(42, '4005');
      (trackDestination as any).killSession(42, '4005');

      const killLogCalls = (mockLoggerProvider.log as jest.Mock).mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('capture stopped for session 42'),
      );
      expect(killLogCalls).toHaveLength(1);
    });

    test('a different session is unaffected by another session being killed', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      (trackDestination as any).killedSessions.add(111);

      const onComplete = jest.fn().mockResolvedValue(undefined);
      trackDestination.addToQueue(baseDirectiveContext({ sessionId: 222, onComplete }));

      // Different session goes through the normal queue path (attempts incremented, queued).
      expect(trackDestination.queue).toHaveLength(1);
      expect(trackDestination.queue[0].sessionId).toBe(222);
      expect(onComplete).not.toHaveBeenCalled();
    });

    test('unknown skip codes are treated as a normal 200 (no slowdown, no kill)', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      mockFetchWithHeader(200, '9999');

      await trackDestination.send(baseDirectiveContext(), true);

      expect((trackDestination as any).flushPauseUntilMs).toBe(0);
      expect((trackDestination as any).killedSessions.size).toBe(0);
    });

    test('worker complete message with skipCode applies directive on main thread', () => {
      const mockWorker = {
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onerror: null as ((e: ErrorEvent) => void) | null,
        onmessage: null as ((e: MessageEvent) => void) | null,
      };
      global.Worker = jest.fn(() => mockWorker) as unknown as typeof Worker;
      global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock');

      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });

      // Inject a pending request so the complete handler has something to resolve.
      const pendingContext = baseDirectiveContext({ sessionId: 777 });
      const resolve = jest.fn();
      (trackDestination as any).pendingWorkerRequests.set('1', { context: pendingContext, resolve });

      mockWorker.onmessage?.({ data: { type: 'complete', id: '1', skipCode: '4004' } } as MessageEvent);

      expect((trackDestination as any).killedSessions.has(777)).toBe(true);
      expect(resolve).toHaveBeenCalled();
    });

    test('worker complete message with no skipCode (error path) does not apply any directive', () => {
      const mockWorker = {
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onerror: null as ((e: ErrorEvent) => void) | null,
        onmessage: null as ((e: MessageEvent) => void) | null,
      };
      global.Worker = jest.fn(() => mockWorker) as unknown as typeof Worker;
      global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock');

      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      (trackDestination as any).flushPauseUntilMs = Date.now() + 60_000;
      const pauseBefore = (trackDestination as any).flushPauseUntilMs;

      const pendingContext = baseDirectiveContext();
      (trackDestination as any).pendingWorkerRequests.set('1', { context: pendingContext, resolve: jest.fn() });

      // skipCode is omitted entirely (the worker only sends it on a 2xx).
      mockWorker.onmessage?.({ data: { type: 'complete', id: '1' } } as MessageEvent);

      // No reset, no kill — pause stays as it was.
      expect((trackDestination as any).flushPauseUntilMs).toBe(pauseBefore);
      expect((trackDestination as any).killedSessions.size).toBe(0);
    });

    test('once a session is killed, in-flight contexts already snapshotted by flush() are dropped before fetch', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });

      // First batch returns 4005 — kill arrives mid-flush.
      mockFetchWithHeader(200, '4005');

      // Pre-load three queued batches for the same session. flush() will snapshot all three
      // and iterate them; the first send() triggers the kill, and the next two should be
      // dropped without firing fetch.
      trackDestination.queue = [
        baseDirectiveContext({ sessionId: 555 }),
        baseDirectiveContext({ sessionId: 555 }),
        baseDirectiveContext({ sessionId: 555 }),
      ];

      await trackDestination.flush(true);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect((trackDestination as any).killedSessions.has(555)).toBe(true);
    });

    test('throttle pause clears on the next clean 200 and a fresh schedule uses no pause', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });

      // First send: 200 + throttled.
      mockFetchWithHeader(200, '429');
      jest.setSystemTime(5_000_000);
      await trackDestination.send(baseDirectiveContext(), true);
      expect((trackDestination as any).flushPauseUntilMs).toBe(5_000_000 + 60_000);

      // While paused, scheduling honors the remaining pause.
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      trackDestination.schedule(0);
      expect(setTimeoutSpy.mock.calls[0][1]).toBe(60_000);
      setTimeoutSpy.mockClear();
      // Clear the pending schedule before continuing the e2e flow.
      clearTimeout((trackDestination as any).scheduled);
      (trackDestination as any).scheduled = null;

      // Advance past the pause; next response is a clean 200.
      jest.setSystemTime(5_000_000 + 61_000);
      mockFetchWithHeader(200, null);
      await trackDestination.send(baseDirectiveContext(), true);

      expect((trackDestination as any).flushPauseUntilMs).toBe(0);

      // send() now registers (and immediately clears) its own request-timeout setTimeout, so
      // reset the spy to isolate the schedule() call we're asserting on.
      setTimeoutSpy.mockClear();
      // A fresh schedule call now uses the requested timeout, with no pause carry-over.
      trackDestination.schedule(500);
      expect(setTimeoutSpy.mock.calls[0][1]).toBe(500);
    });

    test('throttle log fires once per pause-state transition, not per response', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      jest.setSystemTime(7_000_000);
      mockFetchWithHeader(200, '429');
      mockFetchWithHeader(200, '429');
      mockFetchWithHeader(200, '429');

      await trackDestination.send(baseDirectiveContext(), true);
      // Re-throttle within the pause window — should not log again.
      jest.setSystemTime(7_000_000 + 1_000);
      await trackDestination.send(baseDirectiveContext(), true);
      jest.setSystemTime(7_000_000 + 2_000);
      await trackDestination.send(baseDirectiveContext(), true);

      const throttleLogs = (mockLoggerProvider.log as jest.Mock).mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('throttled by server'),
      );
      expect(throttleLogs).toHaveLength(1);
    });

    test('killedSessions is bounded — oldest entry is evicted when cap is exceeded', () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      // Drive far past any reasonable cap and assert the eviction invariant
      // (size doesn't grow unbounded; oldest dropped, newest retained).
      const drives = 1000;
      for (let i = 0; i < drives; i++) {
        (trackDestination as any).killSession(i, '4005');
      }
      const finalSize = (trackDestination as any).killedSessions.size as number;
      expect(finalSize).toBeLessThan(drives);
      // The very first session (id 0) was the oldest and got evicted long before we finished.
      expect((trackDestination as any).killedSessions.has(0)).toBe(false);
      // And the most recent kill is retained.
      expect((trackDestination as any).killedSessions.has(drives - 1)).toBe(true);
    });

    test('non-2xx response on main thread does not invoke any directive', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      (trackDestination as any).flushPauseUntilMs = 1_500_000;
      // Server returns 500 — applyServerDirective must not be called for non-2xx.
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 500,
        headers: { get: jest.fn().mockReturnValue(null) },
      });
      const applySpy = jest.spyOn(trackDestination as any, 'applyServerDirective');

      // useRetry=false so the call returns without recursion
      await trackDestination.send(baseDirectiveContext(), false);

      expect(applySpy).not.toHaveBeenCalled();
      // Pause stays as it was.
      expect((trackDestination as any).flushPauseUntilMs).toBe(1_500_000);
    });
  });

  describe('merge queued sends after throttle pause', () => {
    const baseCtx = (overrides: Partial<SessionReplayDestinationContext> = {}): SessionReplayDestinationContext => ({
      events: [mockEventString],
      sessionId: 123,
      apiKey,
      attempts: 1,
      timeout: 0,
      flushMaxRetries: 2,
      deviceId: '1a2b3c',
      sampleRate: 1,
      serverZone: ServerZone.US,
      type: 'replay',
      onComplete: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    });

    test('schedule sets mergeOnNextFlush only when deferring due to throttle pause', () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      jest.setSystemTime(10_000_000);

      // No pause: flag stays false.
      trackDestination.schedule(0);
      expect((trackDestination as any).mergeOnNextFlush).toBe(false);

      clearTimeout((trackDestination as any).scheduled);
      (trackDestination as any).scheduled = null;

      // Active pause: flag flips on.
      (trackDestination as any).flushPauseUntilMs = 10_000_000 + 30_000;
      trackDestination.schedule(0);
      expect((trackDestination as any).mergeOnNextFlush).toBe(true);
    });

    test('flush merges same-(session,device,api,type) batches into one send and fans out onComplete', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const sendSpy = jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

      const onCompleteA = jest.fn().mockResolvedValue(undefined);
      const onCompleteB = jest.fn().mockResolvedValue(undefined);
      const onCompleteC = jest.fn().mockResolvedValue(undefined);
      trackDestination.queue = [
        baseCtx({ events: ['a1', 'a2'], onComplete: onCompleteA }),
        baseCtx({ events: ['b1'], onComplete: onCompleteB }),
        baseCtx({ events: ['c1', 'c2', 'c3'], onComplete: onCompleteC }),
      ];
      (trackDestination as any).mergeOnNextFlush = true;

      await trackDestination.flush(true);

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const merged = sendSpy.mock.calls[0][0];
      expect(merged.events).toEqual(['a1', 'a2', 'b1', 'c1', 'c2', 'c3']);

      // The merged onComplete must clean up every source IDB record.
      await merged.onComplete();
      expect(onCompleteA).toHaveBeenCalledTimes(1);
      expect(onCompleteB).toHaveBeenCalledTimes(1);
      expect(onCompleteC).toHaveBeenCalledTimes(1);

      // Flag is consumed.
      expect((trackDestination as any).mergeOnNextFlush).toBe(false);
    });

    test('different sessions are kept as separate POSTs', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const sendSpy = jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

      trackDestination.queue = [
        baseCtx({ sessionId: 1, events: ['a'] }),
        baseCtx({ sessionId: 2, events: ['b'] }),
        baseCtx({ sessionId: 1, events: ['c'] }),
      ];
      (trackDestination as any).mergeOnNextFlush = true;

      await trackDestination.flush(true);

      // Two groups by sessionId — session 1 merges, session 2 stays alone.
      expect(sendSpy).toHaveBeenCalledTimes(2);
      const sentBySession = new Map(
        sendSpy.mock.calls.map((c) => {
          const ctx = c[0];
          return [ctx.sessionId, ctx.events];
        }),
      );
      expect(sentBySession.get(1)).toEqual(['a', 'c']);
      expect(sentBySession.get(2)).toEqual(['b']);
    });

    test('merge respects soft size cap by splitting into multiple sends', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const sendSpy = jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

      // Each context is just over half the cap, so any two together exceed it. Expect a split
      // into 3. Derived from the constant so it tracks MAX_EVENT_LIST_SIZE changes.
      const big = 'x'.repeat(Math.floor(MERGE_AFTER_THROTTLE_SOFT_CAP / 2) + 100_000);
      trackDestination.queue = [baseCtx({ events: [big] }), baseCtx({ events: [big] }), baseCtx({ events: [big] })];
      (trackDestination as any).mergeOnNextFlush = true;

      await trackDestination.flush(true);

      // Each event by itself is under the cap, but adding a second pushes over — so each
      // gets sent separately.
      expect(sendSpy).toHaveBeenCalledTimes(3);
    });

    test('flush does not merge when the flag is off (steady state untouched)', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const sendSpy = jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

      trackDestination.queue = [baseCtx({ events: ['a'] }), baseCtx({ events: ['b'] })];
      // mergeOnNextFlush stays false — normal flush path.

      await trackDestination.flush(true);

      expect(sendSpy).toHaveBeenCalledTimes(2);
    });

    test('merged context starts with a fresh retry budget (attempts = 0)', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const sendSpy = jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

      trackDestination.queue = [
        baseCtx({ attempts: 1, events: ['a'] }),
        baseCtx({ attempts: 3, events: ['b'] }),
        baseCtx({ attempts: 2, events: ['c'] }),
      ];
      (trackDestination as any).mergeOnNextFlush = true;

      await trackDestination.flush(true);

      // Resetting to 0 prevents one retry exhaustion from end-of-life'ing every source IDB
      // record. The throttle pause already absorbed back-pressure — recovery deserves a
      // full budget.
      const merged = sendSpy.mock.calls[0][0];
      expect(merged.attempts).toBe(0);
    });

    test('one source onComplete rejection does not block the other source onComplete', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const sendSpy = jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

      const onCompleteFails = jest.fn().mockRejectedValue(new Error('IDB cleanup failed'));
      const onCompleteSucceeds = jest.fn().mockResolvedValue(undefined);

      trackDestination.queue = [
        baseCtx({ events: ['a'], onComplete: onCompleteFails }),
        baseCtx({ events: ['b'], onComplete: onCompleteSucceeds }),
      ];
      (trackDestination as any).mergeOnNextFlush = true;

      await trackDestination.flush(true);

      const merged = sendSpy.mock.calls[0][0];
      // allSettled: the failing onComplete must NOT prevent the succeeding one from running,
      // and the merged onComplete itself must resolve (not reject) so its fire-and-forget
      // caller doesn't produce an unhandled rejection.
      await expect(merged.onComplete()).resolves.toBeUndefined();
      expect(onCompleteFails).toHaveBeenCalledTimes(1);
      expect(onCompleteSucceeds).toHaveBeenCalledTimes(1);
    });

    test('grouping uses safe fallbacks when optional identity fields are absent', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const sendSpy = jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

      // All optional fields (deviceId, apiKey, serverZone, version) are missing on both
      // contexts. They should still group together (matching empty-string fallback) rather
      // than splitting on undefined-vs-undefined string-key collisions.
      trackDestination.queue = [
        baseCtx({
          events: ['a'],
          deviceId: undefined,
          apiKey: undefined,
          serverZone: undefined,
          version: undefined,
        }),
        baseCtx({
          events: ['b'],
          deviceId: undefined,
          apiKey: undefined,
          serverZone: undefined,
          version: undefined,
        }),
      ];
      (trackDestination as any).mergeOnNextFlush = true;

      await trackDestination.flush(true);

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const merged = sendSpy.mock.calls[0][0];
      expect(merged.events).toEqual(['a', 'b']);
    });

    test('grouping uses version.type and version.version when present', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const sendSpy = jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

      // Different version.type splits the group.
      trackDestination.queue = [
        baseCtx({ events: ['a'], version: { type: 'plugin', version: '1.0.0' } }),
        baseCtx({ events: ['b'], version: { type: 'standalone', version: '1.0.0' } }),
      ];
      (trackDestination as any).mergeOnNextFlush = true;

      await trackDestination.flush(true);

      expect(sendSpy).toHaveBeenCalledTimes(2);
    });

    test('mergeOnNextFlush stays cleared after a no-op merge (single context)', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

      trackDestination.queue = [baseCtx({ events: ['only'] })];
      (trackDestination as any).mergeOnNextFlush = true;

      await trackDestination.flush(true);

      expect((trackDestination as any).mergeOnNextFlush).toBe(false);
    });

    test('end-to-end: throttled response → pause → enqueue → release flush merges into one POST', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      jest.setSystemTime(20_000_000);

      // First send is throttled — flushPauseUntilMs gets set.
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 200,
        headers: { get: jest.fn().mockReturnValue('429') },
      });
      await trackDestination.send(baseCtx(), true);
      expect((trackDestination as any).flushPauseUntilMs).toBe(20_000_000 + 60_000);

      // While paused, several batches enqueue. addToQueue → schedule(0) sets the merge flag.
      trackDestination.queue = [];
      const onCompleteA = jest.fn().mockResolvedValue(undefined);
      const onCompleteB = jest.fn().mockResolvedValue(undefined);
      trackDestination.addToQueue(baseCtx({ events: ['a'], onComplete: onCompleteA, attempts: 0 }));
      trackDestination.addToQueue(baseCtx({ events: ['b'], onComplete: onCompleteB, attempts: 0 }));
      expect((trackDestination as any).mergeOnNextFlush).toBe(true);

      // Pause expires; the deferred flush fires. Stub fetch to a clean 200.
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        status: 200,
        headers: { get: jest.fn().mockReturnValue(null) },
      });
      jest.setSystemTime(20_000_000 + 60_001);
      await runScheduleTimers();

      // Single fetch for the merged POST (plus the original throttled one earlier = 2 total).
      const fetchCalls = (global.fetch as jest.Mock).mock.calls;
      expect(fetchCalls).toHaveLength(2);
      const mergedBody = JSON.parse(fetchCalls[1][1].body as string);
      expect(mergedBody.events).toEqual(['a', 'b']);

      // Both source IDB records get cleaned up.
      expect(onCompleteA).toHaveBeenCalled();
      expect(onCompleteB).toHaveBeenCalled();
    });

    test('worker path: merged context onComplete fans out to source IDB cleanups on worker complete', async () => {
      const mockWorker = {
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onerror: null as ((e: ErrorEvent) => void) | null,
        onmessage: null as ((e: MessageEvent) => void) | null,
      };
      global.Worker = jest.fn(() => mockWorker) as unknown as typeof Worker;
      global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock');

      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });

      const onCompleteA = jest.fn().mockResolvedValue(undefined);
      const onCompleteB = jest.fn().mockResolvedValue(undefined);
      trackDestination.queue = [
        baseCtx({ events: ['a'], onComplete: onCompleteA }),
        baseCtx({ events: ['b'], onComplete: onCompleteB }),
      ];
      (trackDestination as any).mergeOnNextFlush = true;

      const flushPromise = trackDestination.flush(true);

      // The merge sends one postMessage with merged events.
      expect(mockWorker.postMessage).toHaveBeenCalledTimes(1);
      const posted = mockWorker.postMessage.mock.calls[0][0];
      expect(posted.payload.events).toEqual(['a', 'b']);

      // Worker reports back complete; merged onComplete must fan out to both sources.
      mockWorker.onmessage?.({ data: { type: 'complete', id: posted.id, skipCode: null } } as MessageEvent);
      await flushPromise;

      expect(onCompleteA).toHaveBeenCalledTimes(1);
      expect(onCompleteB).toHaveBeenCalledTimes(1);
    });

    test('killSession during merge window drains affected contexts before flush merges them', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const sendSpy = jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

      const onCompleteA = jest.fn().mockResolvedValue(undefined);
      const onCompleteB = jest.fn().mockResolvedValue(undefined);
      const onCompleteOther = jest.fn().mockResolvedValue(undefined);
      trackDestination.queue = [
        baseCtx({ sessionId: 999, events: ['a'], onComplete: onCompleteA }),
        baseCtx({ sessionId: 999, events: ['b'], onComplete: onCompleteB }),
        baseCtx({ sessionId: 1000, events: ['c'], onComplete: onCompleteOther }),
      ];
      (trackDestination as any).mergeOnNextFlush = true;

      // Kill session 999 before flush runs — drains its contexts immediately.
      (trackDestination as any).killSession(999, '4005');
      expect(onCompleteA).toHaveBeenCalled();
      expect(onCompleteB).toHaveBeenCalled();

      await trackDestination.flush(true);

      // Only the unaffected session-1000 context goes through.
      expect(sendSpy).toHaveBeenCalledTimes(1);
      const sent = sendSpy.mock.calls[0][0];
      expect(sent.sessionId).toBe(1000);
      expect(sent.events).toEqual(['c']);
    });

    test('413 on merged context cleans up all source IDB records via fanned-out onComplete', () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const sendEventsListSpy = jest.spyOn(trackDestination, 'sendEventsList').mockImplementation(() => undefined);

      const onCompleteA = jest.fn().mockResolvedValue(undefined);
      const onCompleteB = jest.fn().mockResolvedValue(undefined);

      // Build a merged context as mergeQueueAfterThrottle would: events from two sources,
      // onComplete fanning out to both source callbacks.
      const mergedOnComplete = async () => {
        await Promise.all([onCompleteA(), onCompleteB()]);
      };
      const mergedContext: SessionReplayDestinationContext = {
        events: ['a1', 'a2', 'b1', 'b2'],
        sessionId: 123,
        apiKey,
        attempts: 0,
        timeout: 0,
        flushMaxRetries: 2,
        deviceId: '1a2b3c',
        sampleRate: 1,
        serverZone: ServerZone.US,
        type: 'replay',
        onComplete: mergedOnComplete,
      };

      // Trigger the WAF 413 path — splits and re-enqueues both halves with noop onCompletes.
      trackDestination.handlePayloadTooLargeResponse(mergedContext, true);

      // Both source records get cleaned up exactly once.
      expect(onCompleteA).toHaveBeenCalledTimes(1);
      expect(onCompleteB).toHaveBeenCalledTimes(1);

      // Halves re-enqueued with noop onComplete (so they don't double-clean source records).
      expect(sendEventsListSpy).toHaveBeenCalledTimes(2);
      const half1 = sendEventsListSpy.mock.calls[0][0];
      const half2 = sendEventsListSpy.mock.calls[1][0];
      expect(half1.events).toEqual(['a1', 'a2']);
      expect(half2.events).toEqual(['b1', 'b2']);
      // The halves' onComplete is the noop, NOT the merged fan-out.
      expect(half1.onComplete).not.toBe(mergedOnComplete);
      expect(half2.onComplete).not.toBe(mergedOnComplete);
    });

    test('merge log fires once per pause window, not on every release', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

      // First merge during the pause: log fires.
      trackDestination.queue = [baseCtx({ events: ['a'] }), baseCtx({ events: ['b'] })];
      (trackDestination as any).mergeOnNextFlush = true;
      await trackDestination.flush(true);

      // Same pause window, another merge happens (e.g., a second deferred flush in the same
      // sustained throttle): log should NOT fire again.
      trackDestination.queue = [baseCtx({ events: ['c'] }), baseCtx({ events: ['d'] })];
      (trackDestination as any).mergeOnNextFlush = true;
      await trackDestination.flush(true);

      const mergeLogs = (mockLoggerProvider.log as jest.Mock).mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('throttle pause ended; merged'),
      );
      expect(mergeLogs).toHaveLength(1);

      // After a clean 200 (pause clears), the gate resets — next merge logs again.
      (trackDestination as any).applyServerDirective(123, null);
      trackDestination.queue = [baseCtx({ events: ['e'] }), baseCtx({ events: ['f'] })];
      (trackDestination as any).mergeOnNextFlush = true;
      await trackDestination.flush(true);

      const mergeLogsAfter = (mockLoggerProvider.log as jest.Mock).mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('throttle pause ended; merged'),
      );
      expect(mergeLogsAfter).toHaveLength(2);
    });

    describe('coalesce page-load backlog drain (SR-4660)', () => {
      test('markCoalesceNextFlush sets the drain flag, consumed by the next flush', async () => {
        const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
        jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

        expect((trackDestination as any).coalesceNextFlush).toBe(false);
        trackDestination.markCoalesceNextFlush();
        expect((trackDestination as any).coalesceNextFlush).toBe(true);

        trackDestination.queue = [baseCtx({ events: ['a'] }), baseCtx({ events: ['b'] })];
        await trackDestination.flush(true);

        // Flag is consumed so a later unrelated flush isn't accidentally coalesced.
        expect((trackDestination as any).coalesceNextFlush).toBe(false);
      });

      test('markCoalesceNextFlush self-schedules a flush so the flag never sticks when nothing is enqueued', async () => {
        const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
        const sendSpy = jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

        // Mimic the page-load drain where every persisted sequence is dropped before reaching
        // the queue (e.g. all events oversized), so no addToQueue/schedule runs.
        trackDestination.markCoalesceNextFlush();
        expect((trackDestination as any).coalesceNextFlush).toBe(true);

        await jest.runAllTimersAsync();

        // The self-scheduled flush consumes the flag with an empty queue — no POST, and a later
        // unrelated live flush can't be mis-coalesced as a page-load drain.
        expect(sendSpy).not.toHaveBeenCalled();
        expect((trackDestination as any).coalesceNextFlush).toBe(false);
      });

      test('drain of multiple same-identity batches collapses into one POST and fans out onComplete', async () => {
        const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
        const sendSpy = jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

        const onCompleteA = jest.fn().mockResolvedValue(undefined);
        const onCompleteB = jest.fn().mockResolvedValue(undefined);
        const onCompleteC = jest.fn().mockResolvedValue(undefined);
        trackDestination.queue = [
          baseCtx({ events: ['a1', 'a2'], onComplete: onCompleteA }),
          baseCtx({ events: ['b1'], onComplete: onCompleteB }),
          baseCtx({ events: ['c1', 'c2'], onComplete: onCompleteC }),
        ];
        trackDestination.markCoalesceNextFlush();

        await trackDestination.flush(true);

        expect(sendSpy).toHaveBeenCalledTimes(1);
        const merged = sendSpy.mock.calls[0][0];
        expect(merged.events).toEqual(['a1', 'a2', 'b1', 'c1', 'c2']);

        // Each source IDB record is cleaned up exactly once.
        await merged.onComplete();
        expect(onCompleteA).toHaveBeenCalledTimes(1);
        expect(onCompleteB).toHaveBeenCalledTimes(1);
        expect(onCompleteC).toHaveBeenCalledTimes(1);
      });

      test('drain logs the coalesced backlog count when a merge actually happened', async () => {
        const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
        jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

        trackDestination.queue = [baseCtx({ events: ['a'] }), baseCtx({ events: ['b'] }), baseCtx({ events: ['c'] })];
        trackDestination.markCoalesceNextFlush();

        await trackDestination.flush(true);

        const drainLogs = (mockLoggerProvider.log as jest.Mock).mock.calls.filter(
          (c) => typeof c[0] === 'string' && c[0].includes('persisted page-load backlog batches into'),
        );
        expect(drainLogs).toHaveLength(1);
        expect(drainLogs[0][0]).toContain('coalesced 3 persisted page-load backlog batches into 1 request(s)');
      });

      test('drain does NOT merge different-identity batches', async () => {
        const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
        const sendSpy = jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

        // Different sessions must not be coalesced — each keeps its own POST.
        trackDestination.queue = [baseCtx({ sessionId: 1, events: ['a'] }), baseCtx({ sessionId: 2, events: ['b'] })];
        trackDestination.markCoalesceNextFlush();

        await trackDestination.flush(true);

        expect(sendSpy).toHaveBeenCalledTimes(2);
        // A no-op merge (no group shrank) must not emit the drain log.
        const drainLogs = (mockLoggerProvider.log as jest.Mock).mock.calls.filter(
          (c) => typeof c[0] === 'string' && c[0].includes('persisted page-load backlog batches into'),
        );
        expect(drainLogs).toHaveLength(0);
      });

      test('drain still splits an oversized merge across multiple POSTs', async () => {
        const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
        const sendSpy = jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

        // Each event is just over half the soft cap, so any two together exceed it — the
        // greedy merge must flush one-per-context, mirroring the throttle path's behavior.
        // Derived from the constant so it tracks MAX_EVENT_LIST_SIZE changes.
        const big = 'x'.repeat(Math.floor(MERGE_AFTER_THROTTLE_SOFT_CAP / 2) + 100_000);
        trackDestination.queue = [baseCtx({ events: [big] }), baseCtx({ events: [big] }), baseCtx({ events: [big] })];
        trackDestination.markCoalesceNextFlush();

        await trackDestination.flush(true);

        expect(sendSpy).toHaveBeenCalledTimes(3);
      });

      test('a throttle merge on the same flush consumes the drain flag too (no double merge)', async () => {
        const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
        jest.spyOn(trackDestination, 'send').mockResolvedValue(undefined);

        // Both flags set: throttle takes precedence and its merge already coalesces, so the
        // drain flag must be cleared to avoid a redundant second merge on a later flush.
        trackDestination.queue = [baseCtx({ events: ['a'] }), baseCtx({ events: ['b'] })];
        (trackDestination as any).mergeOnNextFlush = true;
        (trackDestination as any).coalesceNextFlush = true;

        await trackDestination.flush(true);

        expect((trackDestination as any).mergeOnNextFlush).toBe(false);
        expect((trackDestination as any).coalesceNextFlush).toBe(false);
      });

      test('end-to-end: drained backlog enqueued via sendEventsList flushes as one coalesced POST', async () => {
        const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
        (global.fetch as jest.Mock).mockResolvedValue({
          status: 200,
          headers: { get: jest.fn().mockReturnValue(null) },
        });

        // Mirror events-manager.sendStoredEvents: mark, then enqueue each persisted sequence.
        trackDestination.markCoalesceNextFlush();
        const onCompleteA = jest.fn().mockResolvedValue(undefined);
        const onCompleteB = jest.fn().mockResolvedValue(undefined);
        trackDestination.sendEventsList(baseCtx({ events: ['a'], onComplete: onCompleteA }) as any);
        trackDestination.sendEventsList(baseCtx({ events: ['b'], onComplete: onCompleteB }) as any);

        await runScheduleTimers();

        // One coalesced POST instead of one-per-sequence.
        const fetchCalls = (global.fetch as jest.Mock).mock.calls;
        expect(fetchCalls).toHaveLength(1);
        const body = JSON.parse(fetchCalls[0][1].body as string);
        expect(body.events).toEqual(['a', 'b']);
        expect(onCompleteA).toHaveBeenCalled();
        expect(onCompleteB).toHaveBeenCalled();
      });
    });
  });

  describe('worker support', () => {
    const mockContext = {
      events: [mockEventString],
      sessionId: 123,
      apiKey,
      attempts: 0,
      timeout: 0,
      deviceId: '1a2b3c',
      sampleRate: 1,
      serverZone: ServerZone.US,
      type: 'replay' as const,
      flushMaxRetries: 2,
      onComplete: jest.fn(),
    };

    let mockWorker: {
      postMessage: jest.Mock;
      terminate: jest.Mock;
      onerror: ((e: ErrorEvent) => void) | null;
      onmessage: ((e: MessageEvent) => void) | null;
    };
    let originalBlob: typeof Blob;

    beforeEach(() => {
      mockWorker = {
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onerror: null,
        onmessage: null,
      };
      global.Worker = jest.fn(() => mockWorker) as unknown as typeof Worker;
      global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock');
      originalBlob = global.Blob;
      global.Blob = jest.fn((parts) => ({ size: (parts as string[]).join('').length })) as unknown as typeof Blob;
    });

    afterEach(() => {
      global.Blob = originalBlob;
    });

    test('constructor initializes worker from workerScript', () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      expect(global.Worker).toHaveBeenCalledTimes(1);
      expect((trackDestination as any).worker).toBeDefined();
    });

    test('constructor falls back gracefully when Worker constructor throws', () => {
      global.Worker = jest.fn(() => {
        throw new Error('Worker not supported');
      }) as unknown as typeof Worker;
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create track destination worker'),
        expect.any(Error),
      );
      expect((trackDestination as any).worker).toBeUndefined();
    });

    test('worker onerror clears worker and resolves pending requests', () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });

      // Inject a fake pending request
      const resolve = jest.fn();
      (trackDestination as any).pendingWorkerRequests.set('1', { context: mockContext, resolve });

      // Trigger onerror
      const errorEvent = {
        preventDefault: jest.fn(),
        message: 'test error',
        filename: 'blob:test',
        lineno: 1,
      } as unknown as ErrorEvent;
      mockWorker.onerror?.(errorEvent);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(errorEvent.preventDefault).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.error).toHaveBeenCalledWith(expect.stringContaining('Track destination worker failed'));
      // onComplete must NOT be called — events were never delivered and must remain in
      // the store for recovery by sendStoredEvents on next init
      expect(mockContext.onComplete).not.toHaveBeenCalled();
      // warn should be emitted per pending request
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        expect.stringContaining('Session replay event send failed due to worker crash'),
      );
      expect(resolve).toHaveBeenCalled();
      expect((trackDestination as any).worker).toBeUndefined();
      expect((trackDestination as any).pendingWorkerRequests.size).toBe(0);
    });

    test('worker onmessage logs for log type', () => {
      new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      mockWorker.onmessage?.({ data: { type: 'log', id: '1', message: 'test log' } } as MessageEvent);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.log).toHaveBeenCalledWith('test log');
    });

    test('worker onmessage warns for warn type', () => {
      new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      mockWorker.onmessage?.({ data: { type: 'warn', id: '1', message: 'test warn' } } as MessageEvent);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith('test warn');
    });

    test('worker onmessage handles payload_too_large by invoking handlePayloadTooLargeResponse', () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      const handleSpy = jest.spyOn(trackDestination, 'handlePayloadTooLargeResponse').mockReturnValueOnce(undefined);
      const resolve = jest.fn();
      (trackDestination as any).pendingWorkerRequests.set('1', { context: mockContext, resolve });

      mockWorker.onmessage?.({ data: { type: 'payload_too_large', id: '1', isWaf: false } } as MessageEvent);

      expect(handleSpy).toHaveBeenCalledWith(mockContext, false);
      expect(resolve).toHaveBeenCalled();
      expect((trackDestination as any).pendingWorkerRequests.size).toBe(0);
    });

    test('worker onmessage completes request for complete type', async () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });

      const resolve = jest.fn();
      (trackDestination as any).pendingWorkerRequests.set('1', { context: mockContext, resolve });

      mockWorker.onmessage?.({ data: { type: 'complete', id: '1' } } as MessageEvent);

      expect(resolve).toHaveBeenCalled();
      expect((trackDestination as any).pendingWorkerRequests.size).toBe(0);
    });

    test('send routes to worker when worker is present', async () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });

      const sendPromise = trackDestination.send(mockContext, false);

      // Simulate worker completing immediately
      const pendingEntries = [...(trackDestination as any).pendingWorkerRequests.entries()];
      expect(pendingEntries).toHaveLength(1);
      const [id] = pendingEntries[0] as [string, { resolve: () => void }];
      mockWorker.onmessage?.({ data: { type: 'complete', id } } as MessageEvent);

      await sendPromise;
      expect(mockWorker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'send' }));
    });

    test('worker send timeout resolves the pending promise without completeRequest', async () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      const completeSpy = jest.spyOn(trackDestination, 'completeRequest');

      // The worker never posts back — emulating its own fetch hanging forever.
      const sendPromise = trackDestination.send(mockContext, true);
      expect((trackDestination as any).pendingWorkerRequests.size).toBe(1);

      jest.advanceTimersByTime(SEND_TIMEOUT_MS);
      await sendPromise;

      // Must resolve so flush() proceeds, but must NOT completeRequest — events were never
      // confirmed delivered, so onComplete stays unfired and the store entry is left for recovery.
      expect(completeSpy).not.toHaveBeenCalled();
      expect(mockContext.onComplete).not.toHaveBeenCalled();
      expect((trackDestination as any).pendingWorkerRequests.size).toBe(0);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(expect.stringContaining('worker send timed out'));
    });

    test('worker timeout timer is cleared when a real response arrives', async () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });

      const sendPromise = trackDestination.send(mockContext, false);
      const pendingEntries = [...(trackDestination as any).pendingWorkerRequests.entries()];
      const [id] = pendingEntries[0] as [string, { resolve: () => void }];
      mockWorker.onmessage?.({ data: { type: 'complete', id } } as MessageEvent);
      await sendPromise;

      // After a real completion the timer is cleared, so advancing past the timeout window
      // must not fire the timeout warn.
      jest.advanceTimersByTime(SEND_TIMEOUT_MS + 1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).not.toHaveBeenCalledWith(expect.stringContaining('worker send timed out'));
    });

    test('worker onerror clears the per-request timeout for in-flight sends', async () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });

      const sendPromise = trackDestination.send(mockContext, true);
      mockWorker.onerror?.({
        preventDefault: jest.fn(),
        message: 'boom',
        filename: 'blob:test',
        lineno: 1,
      } as unknown as ErrorEvent);
      await sendPromise;

      // onerror cleared the per-request timer, so advancing past the window must not also
      // fire the timeout warn.
      jest.advanceTimersByTime(SEND_TIMEOUT_MS + 1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).not.toHaveBeenCalledWith(expect.stringContaining('worker send timed out'));
    });

    test('worker payload_too_large clears the per-request timeout', async () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      jest.spyOn(trackDestination, 'handlePayloadTooLargeResponse').mockReturnValue(undefined);

      const sendPromise = trackDestination.send(mockContext, true);
      const [id] = [...(trackDestination as any).pendingWorkerRequests.keys()] as string[];
      mockWorker.onmessage?.({ data: { type: 'payload_too_large', id, isWaf: false } } as MessageEvent);
      await sendPromise;

      jest.advanceTimersByTime(SEND_TIMEOUT_MS + 1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).not.toHaveBeenCalledWith(expect.stringContaining('worker send timed out'));
    });

    test('worker send timeout is a no-op if the request was already settled (race guard)', async () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });

      const sendPromise = trackDestination.send(mockContext, true);
      const pending = [...(trackDestination as any).pendingWorkerRequests.entries()][0] as [
        string,
        { resolve: () => void },
      ];
      const [id, entry] = pending;
      // Simulate the entry being removed by another path without the timer being cleared, so
      // the timeout fires with no pending request — the guard must return without warning.
      (trackDestination as any).pendingWorkerRequests.delete(id);
      jest.advanceTimersByTime(SEND_TIMEOUT_MS);
      entry.resolve();
      await sendPromise;

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).not.toHaveBeenCalledWith(expect.stringContaining('worker send timed out'));
    });

    test('late worker complete (success) for a timed-out request settles the store record', async () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      const completeSpy = jest.spyOn(trackDestination, 'completeRequest');
      const directiveSpy = jest.spyOn(trackDestination as any, 'applyServerDirective');

      const sendPromise = trackDestination.send(mockContext, true);
      const [id] = [...(trackDestination as any).pendingWorkerRequests.keys()] as string[];
      jest.advanceTimersByTime(SEND_TIMEOUT_MS);
      await sendPromise;
      expect(completeSpy).not.toHaveBeenCalled();
      expect((trackDestination as any).timedOutWorkerRequests.size).toBe(1);

      // The worker finished delivering after the main thread already stopped awaiting it.
      mockWorker.onmessage?.({ data: { type: 'complete', id, skipCode: null } } as MessageEvent);

      expect(directiveSpy).toHaveBeenCalledWith(mockContext.sessionId, null);
      expect(completeSpy).toHaveBeenCalledWith({ context: mockContext });
      expect((trackDestination as any).timedOutWorkerRequests.size).toBe(0);
    });

    test('late worker complete (retries exhausted) for a timed-out request settles without directive', async () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      const completeSpy = jest.spyOn(trackDestination, 'completeRequest');
      const directiveSpy = jest.spyOn(trackDestination as any, 'applyServerDirective');

      const sendPromise = trackDestination.send(mockContext, true);
      const [id] = [...(trackDestination as any).pendingWorkerRequests.keys()] as string[];
      jest.advanceTimersByTime(SEND_TIMEOUT_MS);
      await sendPromise;

      // No skipCode → the worker exhausted retries without a 2xx; settle (drop) the record.
      mockWorker.onmessage?.({ data: { type: 'complete', id } } as MessageEvent);

      expect(directiveSpy).not.toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalledWith({ context: mockContext });
      expect((trackDestination as any).timedOutWorkerRequests.size).toBe(0);
    });

    test('late worker complete for an unknown id is a no-op', () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      const completeSpy = jest.spyOn(trackDestination, 'completeRequest');
      mockWorker.onmessage?.({ data: { type: 'complete', id: 'never-existed', skipCode: null } } as MessageEvent);
      expect(completeSpy).not.toHaveBeenCalled();
    });

    test('late worker payload_too_large for a timed-out request splits off the original record', async () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      const handleSpy = jest.spyOn(trackDestination, 'handlePayloadTooLargeResponse').mockReturnValue(undefined);

      const sendPromise = trackDestination.send(mockContext, true);
      const [id] = [...(trackDestination as any).pendingWorkerRequests.keys()] as string[];
      jest.advanceTimersByTime(SEND_TIMEOUT_MS);
      await sendPromise;

      mockWorker.onmessage?.({ data: { type: 'payload_too_large', id, isWaf: true } } as MessageEvent);

      expect(handleSpy).toHaveBeenCalledWith(mockContext, true);
      expect((trackDestination as any).timedOutWorkerRequests.size).toBe(0);
    });

    test('late worker payload_too_large for an unknown id is a no-op', () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      const handleSpy = jest.spyOn(trackDestination, 'handlePayloadTooLargeResponse').mockReturnValue(undefined);
      mockWorker.onmessage?.({
        data: { type: 'payload_too_large', id: 'never-existed', isWaf: false },
      } as MessageEvent);
      expect(handleSpy).not.toHaveBeenCalled();
    });

    test('timed-out worker requests are bounded (oldest evicted past the cap)', () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      const cap = 256;
      for (let i = 0; i < cap + 5; i++) {
        (trackDestination as any).rememberTimedOutRequest(`id-${i}`, mockContext);
      }
      const map = (trackDestination as any).timedOutWorkerRequests as Map<string, unknown>;
      expect(map.size).toBe(cap);
      // The first five inserted ids are the oldest and must have been evicted.
      expect(map.has('id-0')).toBe(false);
      expect(map.has('id-4')).toBe(false);
      expect(map.has('id-5')).toBe(true);
    });

    test('worker onerror drops retained timed-out requests', async () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });
      const completeSpy = jest.spyOn(trackDestination, 'completeRequest');

      const sendPromise = trackDestination.send(mockContext, true);
      jest.advanceTimersByTime(SEND_TIMEOUT_MS);
      await sendPromise;
      expect((trackDestination as any).timedOutWorkerRequests.size).toBe(1);

      mockWorker.onerror?.({
        preventDefault: jest.fn(),
        message: 'boom',
        filename: 'blob:test',
        lineno: 1,
      } as unknown as ErrorEvent);

      // Memory freed, but the record is intentionally NOT completed (left for sendStoredEvents).
      expect((trackDestination as any).timedOutWorkerRequests.size).toBe(0);
      expect(completeSpy).not.toHaveBeenCalled();
    });

    test('send via worker uses 0 when flushMaxRetries is undefined', async () => {
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
      });

      const contextWithoutRetries = { ...mockContext, flushMaxRetries: undefined as unknown as number };
      const sendPromise = trackDestination.send(contextWithoutRetries, false);

      const pendingEntries = [...(trackDestination as any).pendingWorkerRequests.entries()];
      const [id] = pendingEntries[0] as [string, { resolve: () => void }];
      mockWorker.onmessage?.({ data: { type: 'complete', id } } as MessageEvent);

      await sendPromise;
      const postedMessage = mockWorker.postMessage.mock.calls[0][0] as Record<string, unknown>;
      expect((postedMessage.context as Record<string, unknown>).flushMaxRetries).toBe(0);
    });
  });

  describe('sendBeacon', () => {
    const beaconArgs = {
      sessionId: 123,
      deviceId: 'device-abc',
      apiKey: 'key-abc',
      serverZone: 'US' as keyof typeof ServerZone,
    };

    test('calls sendBeacon with serialized payload', () => {
      const mockSendBeacon = jest.fn().mockReturnValue(true);
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
        navigator: { sendBeacon: mockSendBeacon },
      } as unknown as typeof globalThis);

      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const events = ['e1', 'e2'];
      trackDestination.sendBeacon({ ...beaconArgs, events });

      expect(mockSendBeacon).toHaveBeenCalledWith(
        expect.stringContaining('device_id=device-abc'),
        expect.objectContaining({ type: 'application/json' }),
      );
    });

    test('warns when sendBeacon returns false', () => {
      const mockSendBeacon = jest.fn().mockReturnValue(false);
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
        navigator: { sendBeacon: mockSendBeacon },
      } as unknown as typeof globalThis);

      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      trackDestination.sendBeacon({ ...beaconArgs, events: ['e1'] });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith('sendBeacon failed to queue session replay payload');
    });

    test('trims events and warns when payload exceeds 64 KB', () => {
      const mockSendBeacon = jest.fn().mockReturnValue(true);
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
        navigator: { sendBeacon: mockSendBeacon },
      } as unknown as typeof globalThis);

      // Create events large enough that many together exceed 64 KB
      const bigEvent = 'x'.repeat(2000);
      const events = Array.from({ length: 50 }, () => bigEvent); // ~100 KB total

      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      trackDestination.sendBeacon({ ...beaconArgs, events });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        expect.stringMatching(/sendBeacon payload exceeded 64 KB limit, trimmed from 50 to \d+ events/),
      );
      // Sent payload must be within beacon limit and have correct content type
      const sentPayload = mockSendBeacon.mock.calls[0][1] as Blob;
      expect(sentPayload.size).toBeLessThanOrEqual(64 * 1024);
      expect(sentPayload.type).toBe('application/json');
    });

    test('does not call sendBeacon when all events are too large to fit', () => {
      const mockSendBeacon = jest.fn().mockReturnValue(true);
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
        navigator: { sendBeacon: mockSendBeacon },
      } as unknown as typeof globalThis);

      // A single event larger than 64 KB
      const hugeEvent = 'x'.repeat(65 * 1024);
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      trackDestination.sendBeacon({ ...beaconArgs, events: [hugeEvent] });

      expect(mockSendBeacon).not.toHaveBeenCalled();
    });
  });
});
