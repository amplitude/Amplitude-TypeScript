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
const apiKey = 'static_key';

const baseContext = (): SessionReplayDestinationContext => ({
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
  onComplete: jest.fn(),
});

describe('custom transport (handleSendEvents)', () => {
  let originalFetch: typeof global.fetch;
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    originalFetch = global.fetch;
    global.fetch = jest.fn(() => Promise.resolve({ status: 200 })) as jest.Mock;
    jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({} as unknown as typeof globalThis);
  });
  afterEach(() => {
    jest.resetAllMocks();
    jest.spyOn(global.Math, 'random').mockRestore();
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  describe('main-thread send', () => {
    test('invokes the callback with a fully-formed request and does NOT call fetch', async () => {
      const handleSendEvents = jest.fn(() => Promise.resolve({ status: 200 } as Response));
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        handleSendEvents,
      });

      await trackDestination.send({ ...baseContext(), version: { type: 'plugin', version: VERSION } });

      expect(fetch).not.toHaveBeenCalled();
      expect(handleSendEvents).toHaveBeenCalledTimes(1);
      expect(handleSendEvents).toHaveBeenCalledWith({
        url: 'https://api-sr.amplitude.com/sessions/v2/track?device_id=1a2b3c&session_id=123&type=replay',
        method: 'POST',
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
        body: JSON.stringify({ version: 1, events: [mockEventString] }),
        keepalive: true,
      });
    });

    test('falls back to the built-in fetch when no callback is provided', async () => {
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      await trackDestination.send(baseContext());
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('lets the customer attach custom headers (e.g. JWT) without losing SDK headers', async () => {
      const handleSendEvents = jest.fn(({ url, method, headers, body }) =>
        // mimic the documented customer pattern: spread SDK headers, add auth
        global.fetch(url, { method, headers: { ...headers, Authorization: 'Bearer jwt-123' }, body }),
      );
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        handleSendEvents,
      });

      await trackDestination.send(baseContext());

      expect(handleSendEvents).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(1);
      const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>).Authorization).toBe('Bearer jwt-123');
      // SDK-supplied headers are still present
      expect((options.headers as Record<string, string>)['X-Client-Version']).toBe(VERSION);
    });
  });

  describe('retry contract (callback sits below retry)', () => {
    test.each([500, 408, 429, 499])('retries the callback on %i then succeeds', async (statusCode) => {
      const handleSendEvents = jest
        .fn()
        .mockResolvedValueOnce({ status: statusCode } as Response)
        .mockResolvedValueOnce({ status: 200 } as Response);
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        handleSendEvents,
      });

      const sendPromise = trackDestination.send(baseContext(), true);
      await jest.runAllTimersAsync();
      await sendPromise;

      expect(handleSendEvents).toHaveBeenCalledTimes(2);
      expect(fetch).not.toHaveBeenCalled();
    });

    test('a thrown/rejected callback is surfaced (no retry), matching a thrown fetch', async () => {
      const handleSendEvents = jest.fn().mockRejectedValue(new Error('network down'));
      const onComplete = jest.fn();
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        handleSendEvents,
      });

      const context = { ...baseContext(), onComplete };
      const sendPromise = trackDestination.send(context, true);
      await jest.runAllTimersAsync();
      await sendPromise;

      // thrown error surfaces to completeRequest (same as built-in path); not retried
      expect(handleSendEvents).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('page-exit (sendBeacon) path', () => {
    const beaconArgs = {
      sessionId: 123,
      deviceId: 'device-abc',
      apiKey: 'key-abc',
      serverZone: 'US' as keyof typeof ServerZone,
    };

    test('routes the exit batch through the callback with keepalive instead of sendBeacon', () => {
      const mockSendBeacon = jest.fn().mockReturnValue(true);
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
        navigator: { sendBeacon: mockSendBeacon },
      } as unknown as typeof globalThis);
      const handleSendEvents = jest.fn((_request: { url: string; headers: Record<string, string> }) =>
        Promise.resolve({ status: 200 } as Response),
      );
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        handleSendEvents,
      });

      trackDestination.sendBeacon({ ...beaconArgs, events: ['e1', 'e2'] });

      expect(mockSendBeacon).not.toHaveBeenCalled();
      expect(handleSendEvents).toHaveBeenCalledTimes(1);
      const request = handleSendEvents.mock.calls[0][0] as unknown as {
        url: string;
        method: string;
        headers: Record<string, string>;
        keepalive: boolean;
      };
      expect(request.method).toBe('POST');
      expect(request.keepalive).toBe(true);
      expect(request.url).toContain('device_id=device-abc');
      // api_key is NOT placed in the URL on the callback path (auth is via header)
      expect(request.url).not.toContain('api_key=');
      expect(request.headers.Authorization).toBe('Bearer key-abc');
    });

    test('warns (does not throw) when the exit-path callback rejects on unload', async () => {
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
        navigator: { sendBeacon: jest.fn() },
      } as unknown as typeof globalThis);
      const handleSendEvents = jest.fn(() => Promise.reject(new Error('unload race')));
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        handleSendEvents,
      });

      // Must not throw even though the callback rejects during unload.
      expect(() => trackDestination.sendBeacon({ ...beaconArgs, events: ['e1'] })).not.toThrow();
      expect(handleSendEvents).toHaveBeenCalledTimes(1);
      // Let the rejected promise settle so the .catch handler runs.
      await Promise.resolve();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        'Custom transport failed to send session replay exit batch:',
        expect.any(Error),
      );
    });

    test('warns (does not throw) when the exit-path callback throws synchronously', () => {
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
        navigator: { sendBeacon: jest.fn() },
      } as unknown as typeof globalThis);
      const handleSendEvents = jest.fn(() => {
        throw new Error('sync boom');
      }) as unknown as () => Promise<Response>;
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        handleSendEvents,
      });

      expect(() => trackDestination.sendBeacon({ ...beaconArgs, events: ['e1'] })).not.toThrow();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        'Custom transport threw while sending session replay exit batch:',
        expect.any(Error),
      );
    });

    test('still uses navigator.sendBeacon when no callback is configured', () => {
      const mockSendBeacon = jest.fn().mockReturnValue(true);
      jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue({
        navigator: { sendBeacon: mockSendBeacon },
      } as unknown as typeof globalThis);
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });

      trackDestination.sendBeacon({ ...beaconArgs, events: ['e1'] });

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
    });
  });

  describe('worker delegation (main-thread side: handleDelegatedFetch)', () => {
    const EVENT_SKIPPED_HEADER = 'X-Session-Replay-Event-Skipped';
    const makeMsg = (over: Record<string, unknown> = {}) => ({
      type: 'fetch-request',
      requestId: 'r1',
      url: 'https://api-sr.amplitude.com/sessions/v2/track',
      method: 'POST',
      headers: { Authorization: 'Bearer k' },
      body: '{}',
      keepalive: true,
      ...over,
    });

    test('runs the callback and posts a fetch-response with status + skip header back to the worker', async () => {
      const handleSendEvents = jest.fn(() =>
        Promise.resolve({
          status: 200,
          headers: { get: (n: string) => (n === EVENT_SKIPPED_HEADER ? '4004' : null) },
        } as unknown as Response),
      );
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        handleSendEvents,
      });
      const postMessage = jest.fn();
      const worker = { postMessage } as unknown as Worker;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (trackDestination as any).handleDelegatedFetch(worker, makeMsg());

      expect(handleSendEvents).toHaveBeenCalledTimes(1);
      expect(postMessage).toHaveBeenCalledWith({
        type: 'fetch-response',
        requestId: 'r1',
        status: 200,
        skipHeader: '4004',
        body: '',
      });
    });

    test('reads response body text on 413 for WAF detection', async () => {
      const handleSendEvents = jest.fn(() =>
        Promise.resolve({ status: 413, text: () => Promise.resolve('Payload Too Large') } as unknown as Response),
      );
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        handleSendEvents,
      });
      const postMessage = jest.fn();
      const worker = { postMessage } as unknown as Worker;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (trackDestination as any).handleDelegatedFetch(worker, makeMsg());

      expect(postMessage).toHaveBeenCalledWith({
        type: 'fetch-response',
        requestId: 'r1',
        status: 413,
        skipHeader: null,
        body: 'Payload Too Large',
      });
    });

    test('reports an error when the callback throws', async () => {
      const handleSendEvents = jest.fn(() => Promise.reject(new Error('boom')));
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        handleSendEvents,
      });
      const postMessage = jest.fn();
      const worker = { postMessage } as unknown as Worker;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (trackDestination as any).handleDelegatedFetch(worker, makeMsg());

      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'fetch-response', requestId: 'r1', status: 0, error: true }),
      );
    });

    test('defensively falls back to fetch when no callback is set', async () => {
      // Response without a headers object exercises the optional-chain fallback in skip-header read.
      (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 200 } as unknown as Response);
      const trackDestination = new SessionReplayTrackDestination({ loggerProvider: mockLoggerProvider });
      const postMessage = jest.fn();
      const worker = { postMessage } as unknown as Worker;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (trackDestination as any).handleDelegatedFetch(worker, makeMsg());

      expect(fetch).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        'Delegated session replay fetch (request r1) fell back to built-in fetch because handleSendEvents was missing.',
      );
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'fetch-response', requestId: 'r1', status: 200 }),
      );
    });

    test('worker.onmessage routes a fetch-request to handleDelegatedFetch', () => {
      const mockWorker = {
        postMessage: jest.fn(),
        terminate: jest.fn(),
        onerror: null as ((e: ErrorEvent) => void) | null,
        onmessage: null as ((e: MessageEvent) => void) | null,
      };
      global.Worker = jest.fn(() => mockWorker) as unknown as typeof Worker;
      global.URL.createObjectURL = jest.fn().mockReturnValue('blob:mock');

      const handleSendEvents = jest.fn(() =>
        Promise.resolve({ status: 200, headers: { get: () => null } } as unknown as Response),
      );
      const trackDestination = new SessionReplayTrackDestination({
        loggerProvider: mockLoggerProvider,
        workerScript: 'self.onmessage = () => {}',
        handleSendEvents,
      });
      const spy = jest
        .spyOn(trackDestination as unknown as { handleDelegatedFetch: () => Promise<void> }, 'handleDelegatedFetch')
        .mockResolvedValue(undefined);

      mockWorker.onmessage?.({
        data: {
          type: 'fetch-request',
          requestId: 'r9',
          url: 'u',
          method: 'POST',
          headers: {},
          body: '{}',
          keepalive: true,
        },
      } as MessageEvent);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    test('worker.onmessage logs (does not leave an unhandled rejection) when handleDelegatedFetch rejects', async () => {
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
        handleSendEvents: jest.fn(() => Promise.resolve({ status: 200 } as Response)),
      });
      jest
        .spyOn(trackDestination as unknown as { handleDelegatedFetch: () => Promise<void> }, 'handleDelegatedFetch')
        .mockRejectedValue(new Error('postMessage failed'));

      mockWorker.onmessage?.({
        data: {
          type: 'fetch-request',
          requestId: 'r9',
          url: 'u',
          method: 'POST',
          headers: {},
          body: '{}',
          keepalive: true,
        },
      } as MessageEvent);
      // Let the rejected promise settle so the .catch handler runs.
      await Promise.resolve();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockLoggerProvider.warn).toHaveBeenCalledWith(
        'Failed to handle delegated session replay fetch:',
        expect.any(Error),
      );
    });
  });
});
