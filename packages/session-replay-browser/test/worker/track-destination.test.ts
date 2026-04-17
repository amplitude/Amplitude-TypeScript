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

  test('posts payload_too_large with isWaf=false for app-layer 413', async () => {
    mockFetch.mockResolvedValueOnce({ status: 413, text: () => Promise.resolve('Payload Too Large') });
    await invokeOnMessage({ type: 'send', id: '7', payload: basePayload, context: baseContext, useRetry: true });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'payload_too_large', id: '7', isWaf: false });
    expect(mockPostMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'complete' }));
  });

  test('posts payload_too_large with isWaf=true for WAF 413', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 413,
      text: () => Promise.resolve('{"error":"Payload exceeds the maximum allowed size of 10MB"}'),
    });
    await invokeOnMessage({ type: 'send', id: '8', payload: basePayload, context: baseContext, useRetry: true });

    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'payload_too_large', id: '8', isWaf: true });
  });

  test('posts payload_too_large even when body read fails', async () => {
    mockFetch.mockResolvedValueOnce({ status: 413, text: () => Promise.reject(new Error('stream error')) });
    await invokeOnMessage({ type: 'send', id: '9', payload: basePayload, context: baseContext, useRetry: true });

    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'payload_too_large', id: '9', isWaf: false });
  });

  test('uses false for isWaf when result.isWaf is undefined', async () => {
    // Simulate a response where text() succeeds but body is empty (isWaf will be false via ?? false)
    mockFetch.mockResolvedValueOnce({ status: 413, text: () => Promise.resolve('') });
    await invokeOnMessage({ type: 'send', id: '10', payload: basePayload, context: baseContext, useRetry: true });

    expect(mockPostMessage).toHaveBeenCalledWith({ type: 'payload_too_large', id: '10', isWaf: false });
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
