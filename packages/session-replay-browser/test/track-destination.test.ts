import * as AnalyticsCore from '@amplitude/analytics-core';
import { ILogger, ServerZone } from '@amplitude/analytics-core';
import * as MsgPack from '@msgpack/msgpack';
import { MAX_MSGPACK_PAYLOAD_BYTES } from '../src/constants';
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
            'X-Client-Url': '',
            'X-Client-Version': VERSION,
          },
          method: 'POST',
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
            'X-Client-Url': '',
            'X-Client-Version': VERSION,
          },
          method: 'POST',
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

  describe('msgpack path', () => {
    const mockObjectEvents = [
      { type: 4, timestamp: 1687358660935, data: { href: 'https://example.com', width: 1728, height: 154 } },
      { type: 3, timestamp: 1687358661000, data: { source: 2, positions: [] } },
    ];

    const makeContext = (
      overrides: Partial<SessionReplayDestinationContext> = {},
    ): SessionReplayDestinationContext => ({
      events: mockObjectEvents,
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

    const makeDest = () =>
      new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider, useMessagePack: true });

    test('sends Content-Type: application/x-msgpack', async () => {
      await makeDest().send(makeContext());
      const headers = (fetch as jest.Mock).mock.calls[0][1].headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/x-msgpack');
    });

    test('payload decodes back to original events', async () => {
      // CompressionStream is not available in Jest/Node — body is raw msgpack bytes
      await makeDest().send(makeContext());
      const body = (fetch as jest.Mock).mock.calls[0][1].body as Uint8Array;
      const decoded = MsgPack.decode(body) as { version: number; events: unknown[] };
      expect(decoded.version).toBe(1);
      expect(decoded.events).toEqual(mockObjectEvents);
    });

    test('omits Content-Encoding when CompressionStream is unavailable', async () => {
      await makeDest().send(makeContext());
      const headers = (fetch as jest.Mock).mock.calls[0][1].headers as Record<string, string>;
      expect(headers['Content-Encoding']).toBeUndefined();
    });

    test('sets Content-Encoding: gzip when CompressionStream is available', async () => {
      const fakeOutput = new Uint8Array([31, 139, 0]); // gzip magic bytes
      (global as any).CompressionStream = jest.fn().mockImplementation(() => ({
        writable: {
          getWriter: () => ({
            write: jest.fn().mockResolvedValue(undefined),
            close: jest.fn().mockResolvedValue(undefined),
          }),
        },
        readable: {
          getReader: () => ({
            read: jest
              .fn()
              .mockResolvedValueOnce({ done: false, value: fakeOutput })
              .mockResolvedValueOnce({ done: true, value: undefined }),
          }),
        },
      }));
      try {
        await makeDest().send(makeContext());
        const headers = (fetch as jest.Mock).mock.calls[0][1].headers as Record<string, string>;
        expect(headers['Content-Encoding']).toBe('gzip');
      } finally {
        delete (global as any).CompressionStream;
      }
    });

    test('pre-emptively splits when encoded size exceeds MAX_MSGPACK_PAYLOAD_BYTES', async () => {
      jest.spyOn(MsgPack, 'encode').mockReturnValueOnce(new Uint8Array(MAX_MSGPACK_PAYLOAD_BYTES + 1));
      const dest = makeDest();
      const addToQueue = jest.spyOn(dest, 'addToQueue');
      const context = makeContext({ events: [...mockObjectEvents, ...mockObjectEvents] }); // 4 events

      await dest.send(context);

      expect(fetch).not.toHaveBeenCalled();
      expect(addToQueue).toHaveBeenCalledTimes(1);
      const [first, second] = addToQueue.mock.calls[0];
      expect(first.events).toHaveLength(2);
      expect(second.events).toHaveLength(2);
    });

    test('calls original onComplete once when pre-emptively splitting', async () => {
      jest.spyOn(MsgPack, 'encode').mockReturnValueOnce(new Uint8Array(MAX_MSGPACK_PAYLOAD_BYTES + 1));
      const onComplete = jest.fn().mockResolvedValue(undefined);
      const dest = makeDest();
      jest.spyOn(dest, 'addToQueue').mockReturnValue(undefined);

      await dest.send(makeContext({ onComplete }));

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    test('does not split single-event batch even if encoded size is large', async () => {
      jest.spyOn(MsgPack, 'encode').mockReturnValueOnce(new Uint8Array(MAX_MSGPACK_PAYLOAD_BYTES + 1));
      const dest = makeDest();
      const addToQueue = jest.spyOn(dest, 'addToQueue');

      await dest.send(makeContext({ events: [mockObjectEvents[0]] }));

      expect(addToQueue).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('splits and re-queues on 413 when useMessagePack is true', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 413 });
      const dest = makeDest();
      const addToQueue = jest.spyOn(dest, 'addToQueue');

      await dest.send(makeContext(), true);

      expect(addToQueue).toHaveBeenCalledTimes(1);
      const [first, second] = addToQueue.mock.calls[0];
      expect(first.events).toHaveLength(1);
      expect(second.events).toHaveLength(1);
    });

    test('413 split calls original onComplete and sub-batches get noop', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 413 });
      const onComplete = jest.fn().mockResolvedValue(undefined);
      const dest = makeDest();
      const addToQueue = jest.spyOn(dest, 'addToQueue');

      await dest.send(makeContext({ onComplete }), true);

      expect(onComplete).toHaveBeenCalledTimes(1);
      const [first, second] = addToQueue.mock.calls[0];
      await first.onComplete();
      await second.onComplete();
      // Sub-batch onComplete should be noops — original onComplete still only called once
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    test('does NOT split on 413 when useMessagePack is false', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 413 });
      const dest = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });

      await dest.send(makeContext({ events: [mockEventString, mockEventString] }), true);

      // 413 on JSON path falls through to default → error logged, no re-queue
      expect(fetch).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(dest.queue).toHaveLength(0);
    });
  });
});
