import { Destination } from '../../src/plugins/destination';
import { BaseTransport } from '../../src/transports/base';
import { useDefaultConfig } from '../helpers/default';
import { Event } from '../../src/types/event/event';

const response = (code: number, body = {}) => new BaseTransport().buildResponse({ code, ...body });

describe('client upload retry policy (Android #446)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const setup = async (client = true) => {
    const destination = new Destination(client ? { retryPolicy: 'client' } : undefined);
    const send = jest.fn().mockResolvedValue(response(503));
    const config = {
      ...useDefaultConfig(),
      offline: false,
      flushIntervalMillis: 1,
      flushMaxRetries: 1,
      flushQueueSize: 1,
      transportProvider: { send },
    };
    const stored: Event[][] = [];
    if (config.storageProvider) {
      config.storageProvider.set = jest.fn(async (_key, events) => {
        stored.push([...events]);
      });
    }
    await destination.setup(config);
    return { destination, send, config, stored };
  };

  test('retains events past the old retry cap, plateaus, and delivers after service recovery without reconnect', async () => {
    const { destination, send, config, stored } = await setup();
    const delivered = destination.execute({ event_type: 'during outage' });
    await jest.advanceTimersByTimeAsync(1);
    for (const delay of [1000, 8000, 32000, 128000, 300000, 300000, 300000]) {
      const calls = send.mock.calls.length;
      await jest.advanceTimersByTimeAsync(delay - 1);
      expect(send).toHaveBeenCalledTimes(calls);
      await jest.advanceTimersByTimeAsync(1);
      expect(send).toHaveBeenCalledTimes(calls + 1);
      expect(destination.queue).toHaveLength(1);
      expect(stored[stored.length - 1]).toHaveLength(1);
      expect(config.offline).toBe(false);
    }
    send.mockResolvedValue(response(200));
    await jest.advanceTimersByTimeAsync(300000);
    expect((await delivered).code).toBe(200);
    expect(stored[stored.length - 1]).toEqual([]);
    // The next outage starts at 1s, rather than inheriting the 300s plateau.
    send.mockResolvedValue(response(503));
    void destination.execute({ event_type: 'new outage' });
    await jest.advanceTimersByTimeAsync(1);
    const calls = send.mock.calls.length;
    await jest.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(calls + 1);
  });

  test.each([0, 1 - Number.EPSILON])('jitter stays within +/-50%% at every stage (random=%s)', async (random) => {
    jest.spyOn(Math, 'random').mockReturnValue(random);
    const { destination } = await setup();
    void destination.execute({ event_type: 'jitter' });
    const schedule = jest.spyOn(destination, 'schedule');
    for (const nominal of [1000, 8000, 32000, 128000, 300000, 300000]) {
      destination.handleOtherResponse(destination.queue);
      const wait = schedule.mock.calls[schedule.mock.calls.length - 1][0];
      expect(wait).toBeGreaterThanOrEqual(nominal / 2);
      expect(wait).toBeLessThanOrEqual(nominal * 1.5);
    }
  });

  test('new events and queued batches neither bypass nor postpone a failed upload deadline', async () => {
    const { destination, send } = await setup();
    void destination.execute({ event_type: 'first' });
    void destination.execute({ event_type: 'second batch' });
    await jest.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(500);
    void destination.execute({ event_type: 'new event' });
    await jest.advanceTimersByTimeAsync(499);
    expect(send).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(destination.queue).toHaveLength(3);
  });

  test('every 429 waits 30s past the retry cap, including explicit flush, without advancing backoff', async () => {
    const { destination, send } = await setup();
    send.mockResolvedValue(response(429)); // No explicitly throttled event indices.
    void destination.execute({ event_type: 'rate limited' });
    await jest.advanceTimersByTimeAsync(1);
    await destination.flush();
    expect(send).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(30000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(destination.queue).toHaveLength(1);
    send.mockResolvedValue(response(503));
    await jest.advanceTimersByTimeAsync(30000);
    const calls = send.mock.calls.length;
    await jest.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(calls + 1);
  });

  test('device offline pauses requests and reconnect flush retries retained events immediately', async () => {
    const { destination, send, config } = await setup();
    const delivered = destination.execute({ event_type: 'offline' });
    await jest.advanceTimersByTimeAsync(1);
    config.offline = true;
    await jest.advanceTimersByTimeAsync(100000);
    expect(send).toHaveBeenCalledTimes(1);
    config.offline = false;
    send.mockResolvedValue(response(200));
    await destination.flush();
    expect((await delivered).code).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
  });

  test.each(['throw', 'null', 'http'])('explicit flush retains a retryable %s failure', async (failure) => {
    const { destination, send } = await setup();
    if (failure === 'throw') send.mockRejectedValue(new Error('network timeout'));
    if (failure === 'null') send.mockResolvedValue(null);
    void destination.execute({ event_type: 'manual flush' });
    await destination.flush();
    expect(destination.queue).toHaveLength(1);
    send.mockResolvedValue(response(200));
    await jest.advanceTimersByTimeAsync(1000);
    expect(destination.queue).toHaveLength(0);
  });

  test('concurrent explicit flush calls do not upload the same events twice', async () => {
    const { destination, send } = await setup();
    let complete!: (value: ReturnType<typeof response>) => void;
    send.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    void destination.execute({ event_type: 'once' });
    const first = destination.flush();
    await Promise.resolve();
    await destination.flush();
    expect(send).toHaveBeenCalledTimes(1);
    complete(response(200));
    await first;
  });

  test.each([
    [400, { error: 'Invalid API key: apiKey' }],
    [400, { missing_field: 'events' }],
    [413, { error: 'too big' }],
  ])('terminal %s response drops the event instead of retrying forever', async (code, body) => {
    const { destination, send } = await setup();
    send.mockResolvedValue(response(code, body as object));
    const delivered = destination.execute({ event_type: 'invalid' });
    await jest.advanceTimersByTimeAsync(1);
    expect((await delivered).code).toBe(code);
    await jest.advanceTimersByTimeAsync(300000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(destination.queue).toEqual([]);
  });

  test('server-flagged bad events are dropped and the remaining event survives the retry cap', async () => {
    const { destination, send, config } = await setup();
    config.flushQueueSize = 2;
    send.mockResolvedValueOnce(response(400, { events_with_invalid_fields: { event_type: [0] } }));
    const bad = destination.execute({ event_type: 'bad' });
    const good = destination.execute({ event_type: 'good' });
    await jest.advanceTimersByTimeAsync(1);
    expect((await bad).code).toBe(400);
    expect(destination.queue).toHaveLength(1);
    send.mockResolvedValue(response(200));
    await jest.advanceTimersByTimeAsync(1);
    expect((await good).code).toBe(200);
  });

  test('splits 413 batches without exhausting the retry budget or reducing batch size below one', async () => {
    const { destination, send, config } = await setup();
    config.flushQueueSize = 3;
    send.mockResolvedValueOnce(response(413));
    const events = [1, 2, 3].map((i) => destination.execute({ event_type: `event ${i}` }));
    await jest.advanceTimersByTimeAsync(1);
    expect(config.flushQueueSize).toBe(1);
    expect(destination.queue).toHaveLength(3);
    send.mockResolvedValue(response(200));
    await jest.advanceTimersByTimeAsync(1);
    expect((await Promise.all(events)).every((event) => event.code === 200)).toBe(true);
  });

  test('unidentified proxy errors back off and retain instead of hot-looping', async () => {
    const { destination, send } = await setup();
    send.mockResolvedValue(response(403));
    void destination.execute({ event_type: 'proxy' });
    await jest.advanceTimersByTimeAsync(1);
    await jest.advanceTimersByTimeAsync(999);
    expect(send).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(destination.queue).toHaveLength(1);
  });

  test('silenced devices are terminal while other devices continue, and an empty retry batch schedules nothing', async () => {
    const { destination, send, config } = await setup();
    config.flushQueueSize = 2;
    send.mockResolvedValueOnce(response(400, { silenced_devices: ['silenced'] }));
    const bad = destination.execute({ event_type: 'bad', device_id: 'silenced' });
    const good = destination.execute({ event_type: 'good', device_id: 'allowed' });
    await jest.advanceTimersByTimeAsync(1);
    expect((await bad).code).toBe(400);
    expect(destination.queue).toHaveLength(1);
    send.mockResolvedValue(response(200));
    await jest.advanceTimersByTimeAsync(1);
    expect((await good).code).toBe(200);
    const schedule = jest.spyOn(destination, 'schedule');
    destination.handleOtherResponse([]);
    expect(schedule).not.toHaveBeenCalled();
  });

  test('re-arms an early timer instead of stranding the queue before its retry deadline', async () => {
    const { destination, send } = await setup();
    void destination.execute({ event_type: 'early timer' });
    await jest.advanceTimersByTimeAsync(1);
    const early = Date.now() + 999;
    const now = jest.spyOn(Date, 'now').mockReturnValue(early);
    await jest.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    now.mockRestore();
    await jest.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  test('removing a client destination stops timers, including retries from an in-flight failure', async () => {
    const { destination, send } = await setup();
    let complete!: (value: ReturnType<typeof response>) => void;
    send.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    void destination.execute({ event_type: 'in flight' });
    const flushing = destination.flush();
    await Promise.resolve();
    await destination.teardown();
    complete(response(503));
    await flushing;
    await destination.flush();
    await jest.advanceTimersByTimeAsync(1000000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(destination.queue).toHaveLength(1);
    await destination.setup(destination.config);
    await destination.teardown();
  });

  test('Node destination teardown keeps its existing behavior', async () => {
    const { destination } = await setup(false);
    await destination.teardown();
    const schedule = jest.spyOn(destination, 'schedule');
    void destination.execute({ event_type: 'node' });
    expect(schedule).toHaveBeenCalled();
  });

  test('Node retains its existing bounded retry/drop behavior', async () => {
    const { destination, send } = await setup(false);
    const delivered = destination.execute({ event_type: 'node' });
    await jest.advanceTimersByTimeAsync(1);
    expect((await delivered).code).toBe(500);
    expect(send).toHaveBeenCalledTimes(1);
    expect(destination.queue).toEqual([]);
  });
});
