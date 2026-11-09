import {
  BeforePlugin,
  BrowserConfig,
  Event as AnalyticsEvent,
  Logger,
  getGlobalScope,
} from '@amplitude/analytics-core';
import { engagedTimeTrackingPlugin } from '../src/engaged-time-tracking';
import { createMockBrowserClient } from './mock-browser-client';

jest.mock('@amplitude/analytics-core', () => {
  const actual = jest.requireActual<typeof import('@amplitude/analytics-core')>('@amplitude/analytics-core');
  return { ...actual, getGlobalScope: jest.fn(actual.getGlobalScope) };
});

describe('independent engaged-time tracking', () => {
  let plugin: ReturnType<typeof engagedTimeTrackingPlugin>;
  let client: ReturnType<typeof createMockBrowserClient>;
  let config: BrowserConfig;
  let sent: AnalyticsEvent[];
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  const page = (event_type = 'page_view'): AnalyticsEvent => ({
    event_type,
    insert_id: 'customer-id',
    time: 1234,
    event_properties: { article_id: 'article-a' },
  });
  const setup = async (
    options: Parameters<typeof engagedTimeTrackingPlugin>[0] = { pageViewEventType: 'page_view' },
  ) => {
    plugin = engagedTimeTrackingPlugin(options);
    await plugin.setup!(config, client);
  };
  const latest = () => sent[sent.length - 1];
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(100_000);
    jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    Object.defineProperty(document, 'prerendering', { configurable: true, value: false });
    history.replaceState({}, '', '/article-a');
    config = { loggerProvider: new Logger(), optOut: false } as unknown as BrowserConfig;
    client = createMockBrowserClient();
    sent = [];
    client.track.mockImplementation((eventOrType, event_properties, options) => {
      const event =
        typeof eventOrType === 'string' ? { event_type: eventOrType, event_properties, ...options } : eventOrType;
      return {
        promise: Promise.resolve().then(async () => {
          const result = await plugin.execute!(event);
          if (result) sent.push(result);
          return { event, code: 200, message: '' };
        }),
      };
    });
  });
  afterEach(async () => {
    await plugin?.teardown!();
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    jest.useRealTimers();
  });

  test('defaults to the standard event type without creating events', async () => {
    plugin = engagedTimeTrackingPlugin();
    await plugin.setup!(config, client);
    expect(client.track.mock.calls).toHaveLength(0);
    const custom = page();
    expect(await plugin.execute!(custom)).toBe(custom);
    expect(await plugin.execute!(page('[Amplitude] Page Viewed'))).toBeNull();
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(1);
    expect(latest().event_type).toBe('[Amplitude] Page Viewed');
  });

  test('snapshots custom events and preserves their identity and business properties', async () => {
    await setup({ pageViewEventType: 'page_view', activityWindowMillis: 2000, heartbeatIntervalMillis: 1000 });
    const original = page();
    expect(await plugin.execute!(original)).toBeNull();
    await jest.advanceTimersByTimeAsync(3000);
    expect(sent.length).toBeGreaterThan(1);
    for (const event of sent) {
      expect(event).toMatchObject({
        event_type: 'page_view',
        insert_id: 'customer-id',
        time: 1234,
        event_properties: { article_id: 'article-a' },
      });
      expect(event.delay!.id).toBe(sent[0].delay!.id);
    }
    expect((latest().event_properties as Record<string, unknown>)['[Amplitude] Engaged Time']).toBe(2000);
    expect(await plugin.execute!(page('[Amplitude] Page Viewed'))).toMatchObject({
      event_type: '[Amplitude] Page Viewed',
    });
  });

  test('a second event on the same URL finalizes the old view and starts a fresh group', async () => {
    await setup();
    await plugin.execute!(page());
    await jest.advanceTimersByTimeAsync(1000);
    await plugin.execute!({ event_type: 'page_view', event_properties: { article_id: 'article-b' } });
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(3);
    expect(sent[1]).toMatchObject({
      delay: { timeout: undefined },
      event_properties: { article_id: 'article-a', '[Amplitude] Engaged Time': 1000 },
    });
    expect(sent[2].delay!.id).not.toBe(sent[0].delay!.id);
    expect(sent[2].insert_id).toBeTruthy();
  });

  test.each(['pushState', 'replaceState', 'popstate'] as const)(
    'finalizes on %s without generating a replacement',
    async (method) => {
      await setup();
      await plugin.execute!(page());
      await jest.advanceTimersByTimeAsync(1000);
      // A history update to the same URL is not a new page.
      history.pushState({}, '', '/article-a');
      expect(sent).toHaveLength(1);
      if (method === 'popstate') {
        originalReplaceState.call(history, {}, '', '/article-b');
        window.dispatchEvent(new Event('popstate'));
      } else history[method]({}, '', '/article-b');
      await jest.advanceTimersByTimeAsync(1);
      expect(latest()).toMatchObject({
        delay: { timeout: undefined },
        event_properties: { '[Amplitude] Engagement Snapshot Reason': 'navigation' },
      });
      document.dispatchEvent(new Event('keydown'));
      window.dispatchEvent(new Event('focus'));
      await jest.advanceTimersByTimeAsync(200_000);
      expect(sent).toHaveLength(2);
    },
  );

  test('waits for a new matching event after inactivity and BFCache restoration', async () => {
    await setup({ pageViewEventType: 'page_view', inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 });
    await plugin.execute!(page());
    await jest.advanceTimersByTimeAsync(101);
    const count = sent.length;
    document.dispatchEvent(new Event('keydown'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('pagehide'));
    expect(await plugin.execute!(page())).toBeNull();
    window.dispatchEvent(new Event('pageshow'));
    await jest.advanceTimersByTimeAsync(101);
    expect(sent).toHaveLength(count);
    expect(await plugin.execute!(page())).toBeNull();
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(count + 1);
  });

  test('drops active state at opt-out, including when initially opted out', async () => {
    config.optOut = true;
    await setup();
    expect(await plugin.execute!(page())).toBeNull();
    config.optOut = false;
    await plugin.onOptOutChanged!(false);
    await plugin.execute!(page());
    await jest.advanceTimersByTimeAsync(1);
    await plugin.onOptOutChanged!(true);
    await jest.advanceTimersByTimeAsync(200_000);
    expect(sent).toHaveLength(1);
  });

  test.each(['reset', 'user', 'device', 'session'] as const)(
    'finalizes at the %s boundary and rejects a pending event',
    async (boundary) => {
      await setup();
      const capture = client.add.mock.calls[0][0] as BeforePlugin;
      const pending = await capture.execute!(page());
      await plugin.execute!(page());
      await jest.advanceTimersByTimeAsync(1000);
      if (boundary === 'reset') await plugin.onReset!();
      if (boundary === 'user') await plugin.onIdentityChanged!({ userId: 'new' });
      if (boundary === 'device') await plugin.onIdentityChanged!({ deviceId: 'new' });
      if (boundary === 'session') await plugin.onSessionIdChanged!(2000);
      await jest.advanceTimersByTimeAsync(1);
      expect(latest().delay!.timeout).toBeUndefined();
      const count = sent.length;
      await plugin.onIdentityChanged!({ userProperties: {} });
      expect(await plugin.execute!(pending!)).toBeNull();
      document.dispatchEvent(new Event('keydown'));
      await jest.advanceTimersByTimeAsync(1);
      expect(sent).toHaveLength(count);
      await plugin.execute!(page());
      await jest.advanceTimersByTimeAsync(1);
      expect(sent).toHaveLength(count + 1);
    },
  );

  test('preserves a pending old-page event without replacing current engagement', async () => {
    await setup();
    const capture = client.add.mock.calls[0][0] as BeforePlugin;
    const pending = await capture.execute!(page());
    history.pushState({}, '', '/article-b');
    const current = await capture.execute!({ event_type: 'page_view', extra: { custom: true } });
    await plugin.execute!(current!);
    await jest.advanceTimersByTimeAsync(1);
    expect(await plugin.execute!(pending!)).toBe(pending);
    await jest.advanceTimersByTimeAsync(15_000);
    expect(sent).toHaveLength(2);
    expect(latest().insert_id).toBe(sent[0].insert_id);
    const snapshot = latest();
    expect(await capture.execute!(snapshot)).toBe(snapshot);
  });

  test('falls back to ordinary delivery if the snapshot is too large', async () => {
    await setup();
    jest.spyOn(config.loggerProvider, 'warn').mockImplementation(() => undefined);
    const large = { ...page(), event_properties: { huge: 'x'.repeat(100_000) } };
    expect(await plugin.execute!(large)).toBe(large);
    expect(client.track.mock.calls).toHaveLength(0);
  });

  test('tears down safely with another history wrapper installed', async () => {
    await setup();
    const wrappedPush = history.pushState.bind(history);
    history.pushState = new Proxy(wrappedPush, {
      apply: (target, thisArg, args: Parameters<History['pushState']>) => target.apply(thisArg, args),
    });
    await plugin.teardown!();
    history.pushState({}, '', '/after-teardown');
    expect(client.track.mock.calls).toHaveLength(0);
    await plugin.onOptOutChanged!(false);
    await plugin.onReset!();
    await plugin.onIdentityChanged!({ userId: 'new' });
    await plugin.onSessionIdChanged!(123);
    const event = page();
    expect(await plugin.execute!(event)).toBe(event);
  });

  test.each([undefined, {}])('passes through without a document: %p', async (scope) => {
    jest.mocked(getGlobalScope).mockReturnValueOnce(scope as ReturnType<typeof getGlobalScope>);
    await setup();
    const event = page();
    expect(await plugin.execute!(event)).toBe(event);
  });
});
