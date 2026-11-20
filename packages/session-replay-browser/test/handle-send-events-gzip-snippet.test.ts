/**
 * @jest-environment node
 *
 * Validates the plugin `handleSendEvents` snippet that gunzips the upload body
 * with `DecompressionStream` and logs rrweb `type` / `timestamp`. Node 22 provides
 * real CompressionStream / DecompressionStream / Blob.stream, matching browsers.
 */
import * as AnalyticsCore from '@amplitude/analytics-core';
import { ILogger, ServerZone } from '@amplitude/analytics-core';
import { SendEventsRequest } from '../src/config/types';
import { SessionReplayTrackDestination } from '../src/track-destination';
import { VERSION } from '../src/version';

type MockedLogger = jest.Mocked<ILogger>;

const mockEvent = {
  type: 4,
  data: { href: 'https://analytics.amplitude.com/', width: 1728, height: 154 },
  timestamp: 1687358660935,
};
const mockEventString = JSON.stringify(mockEvent);

/**
 * Exact customer snippet (plugin `handleSendEvents`), minus `console.log` so the
 * test can assert the parsed events.
 */
async function pluginGzipHandleSendEvents(
  request: SendEventsRequest,
  onEvents: (events: Array<{ type: number; timestamp: number }>) => void,
): Promise<Response> {
  let bytes: Uint8Array = typeof request.body === 'string' ? new TextEncoder().encode(request.body) : request.body;
  if (request.headers['Content-Encoding'] === 'gzip') {
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const payload = JSON.parse(new TextDecoder().decode(bytes)) as {
    events?: string[];
  };
  const events = (payload.events ?? []).map((s) => JSON.parse(s) as { type: number; timestamp: number });
  onEvents(events.map((e) => ({ type: e.type, timestamp: e.timestamp })));
  return fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    keepalive: request.keepalive,
  });
}

describe('plugin handleSendEvents gzip logging snippet', () => {
  const mockLoggerProvider: MockedLogger = {
    error: jest.fn(),
    log: jest.fn(),
    disable: jest.fn(),
    enable: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ status: 200 } as Response)) as jest.Mock;
    jest.spyOn(AnalyticsCore, 'getGlobalScope').mockReturnValue(globalThis);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('gunzips a real SDK batch and reads rrweb type/timestamp', async () => {
    expect(typeof CompressionStream).toBe('function');
    expect(typeof DecompressionStream).toBe('function');

    const logged: Array<{ type: number; timestamp: number }> = [];
    const trackDestination = new SessionReplayTrackDestination({
      loggerProvider: mockLoggerProvider,
      enableTransportCompression: true,
      handleSendEvents: (request) => pluginGzipHandleSendEvents(request, (events) => logged.push(...events)),
    });

    await trackDestination.send({
      events: [mockEventString],
      sessionId: 123,
      apiKey: 'static_key',
      attempts: 0,
      timeout: 0,
      flushMaxRetries: 2,
      deviceId: '1a2b3c',
      sampleRate: 1,
      serverZone: ServerZone.US,
      type: 'replay',
      onComplete: jest.fn(),
      version: { type: 'plugin', version: VERSION },
    });

    expect(logged).toEqual([{ type: mockEvent.type, timestamp: mockEvent.timestamp }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/sessions/v2/track');
    expect((options.headers as Record<string, string>)['Content-Encoding']).toBe('gzip');
    expect(options.body).toBeInstanceOf(Uint8Array);
  });

  test('parses an uncompressed JSON body when Content-Encoding is absent', async () => {
    const logged: Array<{ type: number; timestamp: number }> = [];
    const trackDestination = new SessionReplayTrackDestination({
      loggerProvider: mockLoggerProvider,
      enableTransportCompression: false,
      handleSendEvents: (request) => pluginGzipHandleSendEvents(request, (events) => logged.push(...events)),
    });

    await trackDestination.send({
      events: [mockEventString],
      sessionId: 123,
      apiKey: 'static_key',
      attempts: 0,
      timeout: 0,
      flushMaxRetries: 2,
      deviceId: '1a2b3c',
      sampleRate: 1,
      serverZone: ServerZone.US,
      type: 'replay',
      onComplete: jest.fn(),
      version: { type: 'plugin', version: VERSION },
    });

    expect(logged).toEqual([{ type: mockEvent.type, timestamp: mockEvent.timestamp }]);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect((options.headers as Record<string, string>)['Content-Encoding']).toBeUndefined();
    expect(typeof options.body).toBe('string');
  });
});
