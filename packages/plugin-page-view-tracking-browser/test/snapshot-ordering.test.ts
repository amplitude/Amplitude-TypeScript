import { AmplitudeCore, Config, Destination, Status } from '@amplitude/analytics-core';
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
