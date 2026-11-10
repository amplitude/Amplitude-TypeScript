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
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    config = { loggerProvider: new Logger(), optOut: false } as unknown as BrowserConfig;
    client = createMockBrowserClient();
    sent = [];
    client.timeline.plugins = [
      {
        name: 'test-destination',
        type: 'destination',
        execute: async (event) => {
          sent.push(event);
          return { event, code: 200, message: '' };
        },
      },
    ];
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

  test.each([undefined, {}, { pageViewEventType: 'page_view' }])(
    'waits for a matching event with options %p, including after focus, navigation, and activation',
    async (options) => {
      plugin = engagedTimeTrackingPlugin(options);
      const push = Object.getOwnPropertyDescriptor(history, 'pushState');
      const replace = Object.getOwnPropertyDescriptor(history, 'replaceState');
      await plugin.setup!(config, client);
      document.dispatchEvent(new Event('keydown'));
      window.dispatchEvent(new Event('focus'));
      history.pushState({}, '', '/article-b');
      history.replaceState({}, '', '/article-c');
      window.dispatchEvent(new Event('popstate'));
      document.dispatchEvent(new Event('prerenderingchange'));
      await jest.advanceTimersByTimeAsync(200_000);
      expect(sent).toHaveLength(0);
      expect(Object.getOwnPropertyDescriptor(history, 'pushState')).toEqual(push);
      expect(Object.getOwnPropertyDescriptor(history, 'replaceState')).toEqual(replace);
      const expectedType = options?.pageViewEventType ?? '[Amplitude] Page Viewed';
      expect(await plugin.execute!(page('unrelated'))).toMatchObject({ event_type: 'unrelated' });
      expect(await plugin.execute!(page(expectedType))).toBeNull();
      await jest.advanceTimersByTimeAsync(1);
      expect(sent).toHaveLength(1);
      expect(latest().event_type).toBe(expectedType);
    },
  );

  test('does not renew an observed view during prerendering or while the page has exited', async () => {
    await setup({ pageViewEventType: 'page_view', inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 });
    await plugin.execute!(page());
    await jest.advanceTimersByTimeAsync(101);
    const count = sent.length;
    Object.defineProperty(document, 'prerendering', { configurable: true, value: true });
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(count);
    Object.defineProperty(document, 'prerendering', { configurable: true, value: false });
    window.dispatchEvent(new Event('pagehide'));
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(count);
    window.dispatchEvent(new Event('pageshow'));
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(count + 1);
  });

  test.each(['reset', 'opt-out', 'pagehide'] as const)('cancels a queued idle renewal on %s', async (boundary) => {
    await setup({ pageViewEventType: 'page_view', inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 });
    await plugin.execute!(page());
    await jest.advanceTimersByTimeAsync(101);
    const count = sent.length;
    let queued!: AnalyticsEvent;
    let complete!: () => void;
    client.track.mockImplementationOnce((eventOrType) => {
      queued = eventOrType as AnalyticsEvent;
      return {
        promise: new Promise((resolve) => {
          complete = () => resolve({ event: queued, code: 200, message: '' });
        }),
      };
    });
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    if (boundary === 'reset') await plugin.onReset!();
    if (boundary === 'opt-out') {
      config.optOut = true;
      await plugin.onOptOutChanged!(true);
    }
    if (boundary === 'pagehide') window.dispatchEvent(new Event('pagehide'));
    expect(await plugin.execute!(queued)).toBeNull();
    complete();
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(count);
  });

  test('retains campaign metadata on renewal and waits for a matching event after URL changes', async () => {
    await setup({ pageViewEventType: 'page_view', inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 });
    await plugin.execute!({ ...page(), event_properties: { article_id: 'article-a', utm_source: 'campaign-a' } });
    await jest.advanceTimersByTimeAsync(101);
    history.pushState({}, '', '/article-b');
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    const count = sent.length;
    expect(client.track.mock.calls).toHaveLength(0);
    await plugin.execute!({
      event_type: 'page_view',
      event_properties: {
        article_id: 'article-b',
        utm_source: 'campaign-b',
        '[Amplitude] Page Location': '/virtual/article-b',
        '[Amplitude] SDK Initialization Offset': 321,
      },
    });
    await jest.advanceTimersByTimeAsync(101);
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    expect(sent.length).toBeGreaterThan(count);
    expect(latest().event_properties).toMatchObject({
      article_id: 'article-b',
      utm_source: 'campaign-b',
      '[Amplitude] Page Location': '/virtual/article-b',
      '[Amplitude] SDK Initialization Offset': 321,
    });
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

  test('navigation alone does not create or finalize views; a matching event defines the next view', async () => {
    await setup();
    await plugin.execute!(page());
    await jest.advanceTimersByTimeAsync(1000);
    history.pushState({}, '', '/article-b');
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(1);
    await plugin.execute!({ event_type: 'page_view', event_properties: { article_id: 'article-b' } });
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(3);
    expect(sent[1]).toMatchObject({
      delay: { timeout: undefined },
      event_properties: { article_id: 'article-a', '[Amplitude] Engagement Snapshot Reason': 'navigation' },
    });
    expect(latest().event_properties).toMatchObject({ article_id: 'article-b' });
  });

  test('renews once on activity after inactivity and after BFCache restore with the configured name', async () => {
    await setup({ pageViewEventType: 'page_view', inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 });
    await plugin.execute!(page());
    await jest.advanceTimersByTimeAsync(101);
    const count = sent.length;
    const firstId = latest().insert_id;
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 200 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    document.dispatchEvent(new Event('keydown'));
    document.dispatchEvent(new Event('keydown'));
    window.dispatchEvent(new Event('focus'));
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(count + 1);
    expect(latest().event_type).toBe('page_view');
    expect(latest().insert_id).not.toBe(firstId);
    expect(latest().event_properties).toMatchObject({
      article_id: 'article-a',
      '[Amplitude] Min Page Y': 200,
      '[Amplitude] Viewport Width': 800,
    });
    const renewedId = latest().insert_id;
    window.dispatchEvent(new Event('pagehide'));
    expect(await plugin.execute!(page())).toBeNull();
    window.dispatchEvent(new Event('pageshow'));
    await jest.advanceTimersByTimeAsync(1);
    expect(latest().event_type).toBe('page_view');
    expect(latest().insert_id).not.toBe(renewedId);
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
      expect(sent).toHaveLength(count + 1);
      expect(latest().event_type).toBe('page_view');
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

  test('drops a queued idle renewal if a new explicit view arrives first', async () => {
    await setup({ pageViewEventType: 'page_view', inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 });
    await plugin.execute!(page());
    await jest.advanceTimersByTimeAsync(101);
    let queued!: AnalyticsEvent;
    let complete!: () => void;
    client.track.mockImplementationOnce((eventOrType) => {
      queued = eventOrType as AnalyticsEvent;
      return {
        promise: new Promise((resolve) => {
          complete = () => resolve({ event: queued, code: 200, message: '' });
        }),
      };
    });
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    expect(queued).toBeDefined();
    await plugin.execute!({ event_type: 'page_view', event_properties: { article_id: 'new-article' } });
    expect(await plugin.execute!(queued)).toBeNull();
    complete();
    await jest.advanceTimersByTimeAsync(1);
    expect(latest().event_properties).toMatchObject({ article_id: 'new-article' });
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
