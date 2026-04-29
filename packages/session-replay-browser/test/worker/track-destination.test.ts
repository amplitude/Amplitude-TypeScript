import { trackDestinationOnMessage } from '../../src/worker/track-destination';

const SESSION_REPLAY_SERVER_URL = 'https://api-sr.amplitude.com/sessions/v2/track';

type OnMessageHandler = (e: MessageEvent) => Promise<void>;

const invokeOnMessage = async (data: Record<string, unknown>) => {
  await (trackDestinationOnMessage as unknown as OnMessageHandler)({ data } as MessageEvent);
};

describe('worker/track-destination', () => {
  let mockFetch: jest.Mock;
  let mockPostMessage: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    mockPostMessage = jest.fn();
    global.fetch = mockFetch;
    global.postMessage = mockPostMessage;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  const baseContext = {
    apiKey: 'test-api-key',
    deviceId: 'device-123',
    sessionId: 456,
    events: ['{"type":3,"timestamp":1}'],
    eventType: 'replay',
    flushMaxRetries: 2,
    sampleRate: 1,
    currentUrl: 'https://example.com',
    sdkVersion: '1.0.0',
  };

  const basePayload = { version: 1, events: ['{"type":3,"timestamp":1}'] };

  test('ignores messages with unknown type', async () => {
    await invokeOnMessage({ type: 'unknown', id: '1', payload: basePayload, context: baseContext, useRetry: false });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  test('sends fetch request and posts complete on success', async () => {
    mockFetch.mockResolvedValueOnce({ status: 200 });
    await invokeOnMessage({ type: 'send', id: '1', payload: basePayload, context: baseContext, useRetry: false });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(SESSION_REPLAY_SERVER_URL);
    expect(url).toContain('device_id=device-123');
    expect(url).toContain('session_id=456');
    expect(url).toContain('type=replay');
    expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer test-api-key');
    expect(options.method).toBe('POST');

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'log', id: '1', message: expect.stringContaining('tracked successfully') }),
    );
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'complete', id: '1' });
  });

  test('posts warn and complete on non-retryable failure (4xx)', async () => {
    mockFetch.mockResolvedValueOnce({ status: 400 });
    await invokeOnMessage({ type: 'send', id: '2', payload: basePayload, context: baseContext, useRetry: true });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'warn', id: '2' }));
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'complete', id: '2' });
  });

  test('splits multi-event batch on 413 and retries each half', async () => {
    const twoEventPayload = { version: 1, events: ['event1', 'event2'] };
    // First request (both events): 413; half-1 succeeds; half-2 succeeds
    mockFetch
      .mockResolvedValueOnce({ status: 413 })
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValueOnce({ status: 200 });

    await invokeOnMessage({
      type: 'send',
      id: 'split-1',
      payload: twoEventPayload,
      context: { ...baseContext, flushMaxRetries: 2 },
      useRetry: true,
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Should have logged success for the split batches and posted complete once
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'log', id: 'split-1', message: expect.stringContaining('tracked successfully') }),
    );
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'complete', id: 'split-1' });
    // complete posted exactly once
    const completeCalls = (mockPostMessage.mock.calls as unknown[][]).filter(
      (c) => (c[0] as { type: string }).type === 'complete',
    );
    expect(completeCalls).toHaveLength(1);
  });

  test('drops single-event 413 batch with warn (cannot split further)', async () => {
    mockFetch.mockResolvedValueOnce({ status: 413 });

    await invokeOnMessage({
      type: 'send',
      id: 'no-split',
      payload: { version: 1, events: ['single-event'] },
      context: { ...baseContext, flushMaxRetries: 2 },
      useRetry: true,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'warn', id: 'no-split' }));
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'complete', id: 'no-split' });
  });

  test('reports partial delivery when first half succeeds but second half fails', async () => {
    const twoEventPayload = { version: 1, events: ['event1', 'event2'] };
    // Full batch: 413 → split; first half: 200 success; second half: 400 failure
    mockFetch
      .mockResolvedValueOnce({ status: 413 }) // full batch
      .mockResolvedValueOnce({ status: 200 }) // first half (event1) — succeeds
      .mockResolvedValueOnce({ status: 400 }); // second half (event2) — fails

    await invokeOnMessage({
      type: 'send',
      id: 'partial',
      payload: twoEventPayload,
      context: { ...baseContext, flushMaxRetries: 2 },
      useRetry: true,
    });

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warn',
        id: 'partial',
        message: expect.stringContaining('Partial delivery'),
      }),
    );
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'complete', id: 'partial' });
  });

  test('attempts both halves even when first half fails permanently', async () => {
    const twoEventPayload = { version: 1, events: ['event1', 'event2'] };
    // Full batch: 413 → split; first half: 400 (non-retryable); second half: 200 success
    mockFetch
      .mockResolvedValueOnce({ status: 413 }) // full batch
      .mockResolvedValueOnce({ status: 400 }) // first half (event1) — fails
      .mockResolvedValueOnce({ status: 200 }); // second half (event2) — succeeds

    await invokeOnMessage({
      type: 'send',
      id: 'split-fail',
      payload: twoEventPayload,
      context: { ...baseContext, flushMaxRetries: 2 },
      useRetry: true,
    });

    // 3 fetches: original 413 + both halves attempted independently
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // First failure is reported (r1 failed)
    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'warn', id: 'split-fail' }));
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'complete', id: 'split-fail' });
    const completeCalls = (mockPostMessage.mock.calls as unknown[][]).filter(
      (c) => (c[0] as { type: string }).type === 'complete',
    );
    expect(completeCalls).toHaveLength(1);
  });

  test('stops splitting at MAX_SPLIT_DEPTH and reports failure (depth exhaustion)', async () => {
    // A batch of 16 events + a server that 413s everything will exhaust MAX_SPLIT_DEPTH=3
    // (splits down to 2-event batches; single-event 413s are then dropped).
    // All fetches return 413.
    mockFetch.mockResolvedValue({ status: 413 });

    await invokeOnMessage({
      type: 'send',
      id: 'depth-exhaust',
      payload: { version: 1, events: Array.from({ length: 16 }, (_, i) => `event${i}`) },
      context: { ...baseContext, flushMaxRetries: 1 },
      useRetry: false,
    });

    // Regardless of split count, complete is posted exactly once and warn is posted.
    expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'warn', id: 'depth-exhaust' }));
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'complete', id: 'depth-exhaust' });
    const completeCalls = (mockPostMessage.mock.calls as unknown[][]).filter(
      (c) => (c[0] as { type: string }).type === 'complete',
    );
    expect(completeCalls).toHaveLength(1);
  });

  test.each([408, 429, 499])('retries on %i and succeeds on second attempt', async (statusCode) => {
    const realSetTimeout = global.setTimeout;
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((fn) => realSetTimeout(fn, 0) as unknown as ReturnType<typeof setTimeout>);

    mockFetch.mockResolvedValueOnce({ status: statusCode }).mockResolvedValueOnce({ status: 200 });

    await invokeOnMessage({
      type: 'send',
      id: '3b',
      payload: basePayload,
      context: { ...baseContext, flushMaxRetries: 2 },
      useRetry: true,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'log', id: '3b', message: expect.stringContaining('tracked successfully') }),
    );
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'complete', id: '3b' });
  });

  test('retries on 5xx and succeeds on second attempt', async () => {
    // Use a real timer but patch setTimeout to fire immediately so the test is fast
    const realSetTimeout = global.setTimeout;
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((fn) => realSetTimeout(fn, 0) as unknown as ReturnType<typeof setTimeout>);

    mockFetch.mockResolvedValueOnce({ status: 500 }).mockResolvedValueOnce({ status: 200 });

    await invokeOnMessage({
      type: 'send',
      id: '3',
      payload: basePayload,
      context: { ...baseContext, flushMaxRetries: 2 },
      useRetry: true,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'log', id: '3', message: expect.stringContaining('tracked successfully') }),
    );
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'complete', id: '3' });
  });

  test('posts warn with max retries message when retries exhausted', async () => {
    const realSetTimeout = global.setTimeout;
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation((fn) => realSetTimeout(fn, 0) as unknown as ReturnType<typeof setTimeout>);

    mockFetch.mockResolvedValue({ status: 500 });

    await invokeOnMessage({
      type: 'send',
      id: '4',
      payload: basePayload,
      context: { ...baseContext, flushMaxRetries: 2 },
      useRetry: true,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warn',
        id: '4',
        message: 'Session replay event batch rejected due to exceeded retry count',
      }),
    );
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'complete', id: '4' });
  });

  test('does not retry when useRetry is false', async () => {
    mockFetch.mockResolvedValueOnce({ status: 500 });
    await invokeOnMessage({
      type: 'send',
      id: '5',
      payload: basePayload,
      context: { ...baseContext, flushMaxRetries: 5 },
      useRetry: false,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'complete', id: '5' });
  });

  test('posts warn and complete on fetch network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network failure'));
    await invokeOnMessage({ type: 'send', id: '6', payload: basePayload, context: baseContext, useRetry: false });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warn', id: '6', message: expect.stringContaining('network failure') }),
    );
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'complete', id: '6' });
  });

  test('uses EU server URL when serverZone is EU', async () => {
    mockFetch.mockResolvedValueOnce({ status: 200 });
    await invokeOnMessage({
      type: 'send',
      id: '7',
      payload: basePayload,
      context: { ...baseContext, serverZone: 'EU' },
      useRetry: false,
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('api-sr.eu.amplitude.com');
  });

  test('uses custom trackServerUrl when provided', async () => {
    mockFetch.mockResolvedValueOnce({ status: 200 });
    await invokeOnMessage({
      type: 'send',
      id: '8',
      payload: basePayload,
      context: { ...baseContext, trackServerUrl: 'https://custom.example.com/track' },
      useRetry: false,
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('https://custom.example.com/track');
  });

  test('uses staging URL when serverZone is STAGING', async () => {
    mockFetch.mockResolvedValueOnce({ status: 200 });
    await invokeOnMessage({
      type: 'send',
      id: '9',
      payload: basePayload,
      context: { ...baseContext, serverZone: 'STAGING' },
      useRetry: false,
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('api-sr.stag2.amplitude.com');
  });

  test('includes version library header when version is provided', async () => {
    mockFetch.mockResolvedValueOnce({ status: 200 });
    await invokeOnMessage({
      type: 'send',
      id: '10',
      payload: basePayload,
      context: { ...baseContext, version: { type: 'plugin', version: '2.0.0' } },
      useRetry: false,
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['X-Client-Library']).toBe('plugin/2.0.0');
  });

  test('returns null result when fetch returns null', async () => {
    mockFetch.mockResolvedValueOnce(null);
    await invokeOnMessage({ type: 'send', id: '11', payload: basePayload, context: baseContext, useRetry: false });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'warn', id: '11', message: 'Unexpected error occurred' }),
    );
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'complete', id: '11' });
  });

  test('falls back to uncompressed when CompressionStream throws', async () => {
    class BrokenCompressionStream {
      constructor() {
        throw new Error('not supported');
      }
    }
    (global as any).CompressionStream = BrokenCompressionStream;

    try {
      mockFetch.mockResolvedValueOnce({ status: 200 });
      await invokeOnMessage({ type: 'send', id: '13', payload: basePayload, context: baseContext, useRetry: false });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>)['Content-Encoding']).toBeUndefined();
      expect(typeof options.body).toBe('string');
    } finally {
      delete (global as any).CompressionStream;
    }
  });

  test('gzip-compresses payload when CompressionStream is available', async () => {
    // Mock CompressionStream with mock reader/writer objects (avoids ReadableStream/WritableStream
    // availability issues in the jsdom test environment).
    const mockCompressed = new Uint8Array([0x1f, 0x8b]);
    const mockWriter = { write: jest.fn().mockResolvedValue(undefined), close: jest.fn().mockResolvedValue(undefined) };
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

    // In jest+jsdom, 'CompressionStream' is checked via `'CompressionStream' in self`
    // where `self === global`. Set it on global so the check passes.
    (global as any).CompressionStream = MockCompressionStream;

    try {
      mockFetch.mockResolvedValueOnce({ status: 200 });
      await invokeOnMessage({ type: 'send', id: '12', payload: basePayload, context: baseContext, useRetry: false });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((options.headers as Record<string, string>)['Content-Encoding']).toBe('gzip');
      expect(options.body).toEqual(mockCompressed);
    } finally {
      delete (global as any).CompressionStream;
    }
  });
});
