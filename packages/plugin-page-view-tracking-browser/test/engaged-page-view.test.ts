import { BrowserConfig, BaseEvent, Logger, PageTrackingOptions } from '@amplitude/analytics-core';
import { pageViewTrackingPlugin } from '../src/page-view-tracking';
import { createMockBrowserClient } from './mock-browser-client';

describe('engaged page-view plugin', () => {
  let plugin: ReturnType<typeof pageViewTrackingPlugin>;
  let client: ReturnType<typeof createMockBrowserClient>;
  let config: BrowserConfig;
  const captured: BaseEvent[] = [];

  const setup = async (options: PageTrackingOptions = {}) => {
    plugin = pageViewTrackingPlugin({ trackEngagedTime: true, ...options });
    await plugin.setup!(config, client);
    await jest.advanceTimersByTimeAsync(1);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    Object.defineProperty(document, 'prerendering', { configurable: true, value: false });
    config = { loggerProvider: new Logger(), optOut: false } as unknown as BrowserConfig;
    client = createMockBrowserClient();
    captured.length = 0;
    client.track.mockImplementation((eventOrType, props, options) => {
      const event =
        typeof eventOrType === 'string'
          ? { event_type: eventOrType, event_properties: props, ...options }
          : eventOrType;
      return {
        promise: Promise.resolve().then(async () => {
          const result = await plugin.execute!(event);
          if (result) captured.push(result);
          return { event, code: 200, message: '' };
        }),
      };
    });
  });

  afterEach(async () => {
    await plugin?.teardown!();
    jest.useRealTimers();
  });

  test('suppresses the immediate page view and preserves counter and page ID across snapshots', async () => {
    await setup();
    await jest.advanceTimersByTimeAsync(30_000);
    expect(captured).toHaveLength(3);
    expect(captured.every((event) => event.delay && event.event_type === '[Amplitude] Page Viewed')).toBe(true);
    expect(config.pageCounter).toBe(1);
    expect(captured[0].event_properties!['[Amplitude] Page View ID']).toBeTruthy();
    expect(captured[2].event_properties!['[Amplitude] Page View ID']).toBe(
      captured[0].event_properties!['[Amplitude] Page View ID'],
    );
    expect(captured[2].event_properties!['[Amplitude] Engaged Time']).toBe(5_000);
  });

  test('renews once on activity after expiry and respects trackOn gating', async () => {
    const trackOn = jest.fn(() => true);
    await setup({ trackOn, pageSessionTimeoutMillis: 100, heartbeatIntervalMillis: 20 });
    await jest.advanceTimersByTimeAsync(100);
    trackOn.mockReturnValue(false);
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    expect(config.pageCounter).toBe(1);
    trackOn.mockReturnValue(true);
    document.dispatchEvent(new Event('keydown'));
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    expect(config.pageCounter).toBe(2);
    expect(captured[captured.length - 1].insert_id).not.toBe(captured[0].insert_id);
  });

  test('finalizes on identity and session changes, reset and teardown', async () => {
    await setup();
    await plugin.onIdentityChanged!({ userProperties: { plan: 'pro' } });
    expect(captured).toHaveLength(1);
    await plugin.onIdentityChanged!({ userId: 'new-user' });
    await jest.advanceTimersByTimeAsync(1);
    expect(captured[captured.length - 1].delay!.timeout).toBeUndefined();
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    await plugin.onSessionIdChanged!(123);
    await jest.advanceTimersByTimeAsync(1);
    expect(captured[captured.length - 1].event_properties!['[Amplitude] Engagement Snapshot Reason']).toBe(
      'session_change',
    );
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    await plugin.onReset!();
    await jest.advanceTimersByTimeAsync(1);
    expect(captured[captured.length - 1].event_properties!['[Amplitude] Engagement Snapshot Reason']).toBe('reset');
    await plugin.onOptOutChanged!(true);
    document.dispatchEvent(new Event('keydown'));
    await plugin.onOptOutChanged!(false);
  });

  test('defers initial page view while prerendering', async () => {
    Object.defineProperty(document, 'prerendering', { configurable: true, value: true });
    await setup();
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(20_000);
    expect(client.track.mock.calls).toHaveLength(0);
    Object.defineProperty(document, 'prerendering', { configurable: true, value: false });
    document.dispatchEvent(new Event('prerenderingchange'));
    await jest.advanceTimersByTimeAsync(1);
    expect(captured).toHaveLength(1);
  });

  test('does not activate a prerendered page after teardown', async () => {
    Object.defineProperty(document, 'prerendering', { configurable: true, value: true });
    await setup();
    await plugin.teardown!();
    document.dispatchEvent(new Event('prerenderingchange'));
    expect(client.track.mock.calls).toHaveLength(0);
  });

  test('navigation finalizes the old URL and starts a fresh view', async () => {
    await setup();
    const url = captured[0].event_properties!['[Amplitude] Page URL'];
    history.pushState({}, '', '/engagement-test');
    await jest.advanceTimersByTimeAsync(2);
    expect(config.pageCounter).toBe(2);
    expect(captured[1].delay!.timeout).toBeUndefined();
    expect(captured[1].event_properties!['[Amplitude] Page URL']).toBe(url);
    expect(captured[2].event_properties!['[Amplitude] Page Path']).toBe('/engagement-test');
  });

  test('lifecycle notifications preserve the default immediate-page-view behavior when disabled', async () => {
    await setup({ trackEngagedTime: false });
    await plugin.onOptOutChanged!(true);
    await plugin.onReset!();
    await plugin.onIdentityChanged!({ deviceId: 'new-device' });
    await plugin.onSessionIdChanged!(123);
    expect(captured).toHaveLength(1);
    expect(captured[0].delay).toBeUndefined();
  });

  test('checks consent again after asynchronous page creation', async () => {
    await setup({ pageSessionTimeoutMillis: 10, heartbeatIntervalMillis: 2 });
    await jest.advanceTimersByTimeAsync(10);
    const count = client.track.mock.calls.length;
    document.dispatchEvent(new Event('keydown'));
    config.optOut = true;
    await jest.advanceTimersByTimeAsync(1);
    expect(client.track.mock.calls).toHaveLength(count);
  });

  test('continues after inactivity without session storage', async () => {
    jest.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('unavailable');
    });
    await setup({ pageSessionTimeoutMillis: 10, heartbeatIntervalMillis: 2 });
    await jest.advanceTimersByTimeAsync(10);
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    expect(config.pageCounter).toBe(2);
    expect(captured[captured.length - 1].event_properties!['[Amplitude] Page View ID']).toBeTruthy();
  });

  test('navigation cancels an in-flight inactivity renewal instead of creating a duplicate view', async () => {
    await setup({ pageSessionTimeoutMillis: 10, heartbeatIntervalMillis: 2 });
    await jest.advanceTimersByTimeAsync(10);
    document.dispatchEvent(new Event('pointerdown'));
    history.pushState({}, '', '/after-expiry');
    await jest.advanceTimersByTimeAsync(2);
    expect(config.pageCounter).toBe(2);
    expect(captured[captured.length - 1].event_properties!['[Amplitude] Page Path']).toBe('/after-expiry');
  });

  test('rapid SPA navigation keeps the metadata of each distinct page', async () => {
    await setup();
    history.pushState({}, '', '/first-fast-page');
    history.pushState({}, '', '/second-fast-page');
    await jest.advanceTimersByTimeAsync(2);
    expect(config.pageCounter).toBe(3);
    expect(captured.some((event) => event.event_properties!['[Amplitude] Page Path'] === '/first-fast-page')).toBe(
      true,
    );
    expect(captured[captured.length - 1].event_properties!['[Amplitude] Page Path']).toBe('/second-fast-page');
  });
});
