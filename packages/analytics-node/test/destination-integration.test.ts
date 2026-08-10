import { Destination, Event, LogLevel } from '@amplitude/analytics-core';
import * as http from 'http';
import { AddressInfo } from 'net';
import { NodeConfig } from '../src/config';

/**
 * SDK-188: an upload that never settles used to pin Destination.flushId, which
 * made every later flush a no-op while execute() kept appending to an uncapped
 * queue. These assert the queue drains no matter how the upload fails.
 */
describe('destination integration: upload timeout', () => {
  let server: http.Server;
  let serverUrl: string;
  let requestCount: number;

  const listen = async (handler: http.RequestListener) => {
    requestCount = 0;
    server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        requestCount += 1;
        handler(req, res);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    serverUrl = `http://localhost:${(server.address() as AddressInfo).port}/2/httpapi`;
  };

  const setupDestination = async (overrides = {}) => {
    const config = new NodeConfig('a'.repeat(32), {
      serverUrl,
      requestTimeoutMillis: 50,
      flushIntervalMillis: 10,
      flushQueueSize: 5,
      logLevel: LogLevel.None,
      ...overrides,
    });
    const destination = new Destination();
    destination.retryTimeout = 10;
    await destination.setup(config);
    return destination;
  };

  const events = (count: number): Event[] =>
    Array.from({ length: count }, (_, i) => ({ event_type: 'exposure', insert_id: `id-${i}` }));

  // Callbacks fire inside send(), one tick before flush() clears flushId. Poll
  // instead of asserting immediately; a flushId that never clears is the bug.
  const waitForFlushToRelease = async (destination: Destination) => {
    for (let i = 0; i < 200 && destination.flushId !== null; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  test('should recover once a stalled upload times out', async () => {
    await listen((_, res) => {
      // Hold the first upload open forever, then behave normally.
      if (requestCount === 1) {
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 200 }));
    });
    const destination = await setupDestination();

    const results = await Promise.all(events(20).map((event) => destination.execute(event)));

    expect(requestCount).toBeGreaterThan(1);
    expect(results.every((result) => result.code === 200)).toBe(true);
    await waitForFlushToRelease(destination);

    expect(destination.queue).toHaveLength(0);
    expect(destination.flushId).toBeNull();
  });

  test('should drain the queue when every upload stalls', async () => {
    await listen(() => {
      // Never respond to anything.
    });
    const destination = await setupDestination({ flushMaxRetries: 2 });

    const results = await Promise.all(events(20).map((event) => destination.execute(event)));

    expect(results.every((result) => result.code === 500)).toBe(true);
    await waitForFlushToRelease(destination);

    expect(destination.queue).toHaveLength(0);
    expect(destination.flushId).toBeNull();
  });

  test('should drain the queue when uploads return an empty body', async () => {
    await listen((_, res) => {
      res.writeHead(200, { 'Content-Length': '0' });
      res.end();
    });
    const destination = await setupDestination();

    const results = await Promise.all(events(20).map((event) => destination.execute(event)));

    expect(results.every((result) => result.code === 200)).toBe(true);
    await waitForFlushToRelease(destination);

    expect(destination.queue).toHaveLength(0);
    expect(destination.flushId).toBeNull();
  });
});
