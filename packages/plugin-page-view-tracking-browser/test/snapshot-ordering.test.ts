import { AmplitudeCore, BaseTransport, Config, Destination, Payload, Status } from '@amplitude/analytics-core';
import { pageViewTrackingPlugin } from '../src/page-view-tracking';

class TestClient extends AmplitudeCore {
  init(config: Config) {
    return this._init(config);
  }
}

describe('engagement delivery through the SDK pipeline', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(100_000);
    jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => jest.useRealTimers());

  test.each([100, 1_500])(
    'flushes a fresh blur snapshot without waiting for the batch interval, %i ms after the automatic send',
    async (afterInitial) => {
      const accepted = new Map<string, number>();
      const requests: { at: number; code: number; engaged: number }[] = [];
      const send = jest.fn((_url: string, payload: Payload) => {
        const { id } = payload as Payload & { id: string };
        const now = Date.now();
        const code = now - (accepted.get(id) ?? -Infinity) < 1_000 ? 429 : 200;
        if (code === 200) accepted.set(id, now);
        const properties = payload.events[0]?.event_properties as Record<string, number> | undefined;
        requests.push({ at: now, code, engaged: properties?.['[Amplitude] Engaged Time'] ?? 0 });
        return Promise.resolve(new BaseTransport().buildResponse({ code }));
      });
      const config = new Config({ apiKey: 'test', transportProvider: { send }, flushIntervalMillis: 1_000 });
      jest.spyOn(config.loggerProvider, 'error').mockImplementation(() => undefined);
      const client = new TestClient();
      await client.init(config);
      await client.add(new Destination()).promise;
      Object.defineProperty(document, 'prerendering', { configurable: true, value: true });
      const plugin = pageViewTrackingPlugin({ trackEngagedTime: true });
      await client.add(plugin).promise;
      Object.defineProperty(document, 'prerendering', { configurable: true, value: false });
      try {
        client.track({ event_type: '[Amplitude] Page Viewed', insert_id: 'manual-flush-page' });
        await jest.advanceTimersByTimeAsync(1_010 + afterInitial);
        expect(requests).toHaveLength(1);
        const blurredAt = Date.now();
        window.dispatchEvent(new Event('blur'));
        await jest.advanceTimersByTimeAsync(0);
        expect(requests).toHaveLength(2);
        expect(requests[1]).toEqual({
          at: blurredAt,
          code: afterInitial < 1_000 ? 429 : 200,
          engaged: blurredAt - 100_000,
        });
        await jest.advanceTimersByTimeAsync(50);
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        await jest.advanceTimersByTimeAsync(0);
        expect(requests).toHaveLength(2);
        await jest.advanceTimersByTimeAsync(950);
        expect(requests[2]).toEqual({ at: blurredAt + 1_000, code: 200, engaged: requests[1].engaged });
        // Lifecycle flushes preserve their existing no-retry behavior.
        await jest.advanceTimersByTimeAsync(5_000);
        expect(requests).toHaveLength(3);
      } finally {
        await client.remove(plugin.name!).promise;
      }
    },
  );

  test('delivers a rejected snapshot as one ordinary page view through the real destination', async () => {
    const send = jest.fn().mockResolvedValue({ status: Status.Success, statusCode: 200, body: { code: 200 } });
    const config = new Config({ apiKey: 'test', transportProvider: { send }, flushIntervalMillis: 10 });
    jest.spyOn(config.loggerProvider, 'warn').mockImplementation(() => undefined);
    const client = new TestClient();
    await client.init(config);
    await client.add(new Destination()).promise;
    Object.defineProperty(document, 'prerendering', { configurable: true, value: true });
    const plugin = pageViewTrackingPlugin({ trackEngagedTime: true });
    await client.add(plugin).promise;
    Object.defineProperty(document, 'prerendering', { configurable: true, value: false });
    try {
      const properties = Object.fromEntries(
        Array.from({ length: 60 }, (_, index) => [`field${index}`, 'x'.repeat(800)]),
      );
      const result = client.track({
        event_type: '[Amplitude] Page Viewed',
        insert_id: 'large-page',
        event_properties: properties,
      }).promise;
      await jest.advanceTimersByTimeAsync(20);
      expect((await result).code).toBe(200);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).not.toContain('/delayed');
      expect(send.mock.calls[0][1].events).toHaveLength(1);
      expect(send.mock.calls[0][1].events[0]).toMatchObject({
        event_type: '[Amplitude] Page Viewed',
        insert_id: 'large-page',
        event_properties: { ...properties, '[Amplitude] Page Counter': 1 },
      });
      expect(send.mock.calls[0][1].events[0].event_properties['[Amplitude] Engaged Time']).toBeUndefined();
      window.dispatchEvent(new Event('blur'));
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('keydown'));
      await jest.advanceTimersByTimeAsync(180_000);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      await client.remove(plugin.name!).promise;
    }
  });
});
