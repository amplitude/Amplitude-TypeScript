import * as AnalyticsCore from '@amplitude/analytics-core';
import { ILogger, ServerZone } from '@amplitude/analytics-core';
import { SessionReplayDestinationContext } from 'src/typings/session-replay';
import { SessionReplayTrackDestination } from '../src/track-destination';
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

    test('killing a session is idempotent (second directive does not re-drain queue)', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      mockFetchWithHeader(200, '4005');
      mockFetchWithHeader(200, '4005');
      await trackDestination.send(baseDirectiveContext({ sessionId: 42 }), true);
      await trackDestination.send(baseDirectiveContext({ sessionId: 42 }), true);

      // The kill log should fire exactly once.
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
