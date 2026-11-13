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
  const deliverSource = async (event: AnalyticsEvent) => {
    const result = await plugin.execute!(event);
    if (result?.delay) sent.push(result);
    return result;
  };
  const renewals = () => client.track.mock.calls.filter(([event]) => typeof event !== 'string');
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
      expect(await deliverSource(page('unrelated'))).toMatchObject({ event_type: 'unrelated' });
      expect(await deliverSource(page(expectedType))).toMatchObject({ delay: { timeout: 180_000 } });
      await jest.advanceTimersByTimeAsync(1);
      expect(sent).toHaveLength(1);
      expect(latest().event_type).toBe(expectedType);
    },
  );

  test.each(['[Amplitude] Page Viewed', 'page_view'])(
    'uses a separate secondary name after %s expires, without copying business properties',
    async (primary) => {
      await setup({
        ...(primary === '[Amplitude] Page Viewed' ? {} : { pageViewEventType: primary }),
        secondaryPageViewEventType: 'Engagement Resumed',
        inactivityTimeoutMillis: 100,
        heartbeatIntervalMillis: 20,
      });
      expect(await deliverSource(page('Engagement Resumed'))).not.toHaveProperty('delay');
      document.dispatchEvent(new Event('keydown'));
      await jest.advanceTimersByTimeAsync(1);
      expect(renewals()).toHaveLength(0);
      await deliverSource(page(primary));
      document.dispatchEvent(new Event('keydown'));
      await jest.advanceTimersByTimeAsync(1);
      expect(renewals()).toHaveLength(0);
      await jest.advanceTimersByTimeAsync(100);
      const finalized = latest();
      expect(finalized.event_type).toBe(primary);
      expect(finalized.delay!.timeout).toBeUndefined();
      for (let cycle = 0; cycle < 2; cycle++) {
        document.dispatchEvent(new Event('keydown'));
        await jest.advanceTimersByTimeAsync(1);
        const initial = latest();
        expect(initial.event_type).toBe('Engagement Resumed');
        expect(initial.delay).toHaveProperty('timeout', 100);
        expect(initial.delay!.id).not.toBe(finalized.delay!.id);
        expect(initial.insert_id).not.toBe(finalized.insert_id);
        expect(initial.time).toBeGreaterThan(finalized.time!);
        expect(initial.event_properties).not.toHaveProperty('article_id');
        await jest.advanceTimersByTimeAsync(100);
        expect(latest().event_type).toBe('Engagement Resumed');
        expect(latest().insert_id).toBe(initial.insert_id);
        expect(latest().delay!.id).toBe(initial.delay!.id);
        expect(latest().delay!.timeout).toBeUndefined();
      }
      await deliverSource(page(primary));
      expect(latest().event_type).toBe(primary);
      expect(latest().delay).toHaveProperty('timeout', 100);
    },
  );

  test('drops a generated renewal queued across navigation before page enrichment', async () => {
    await setup({ pageViewEventType: 'page_view', inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 });
    await deliverSource(page());
    await jest.advanceTimersByTimeAsync(101);
    let queued!: AnalyticsEvent;
    client.track.mockImplementationOnce((event) => {
      queued = event as AnalyticsEvent;
      return { promise: Promise.resolve({ event: queued, code: 200, message: '' }) };
    });
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    history.pushState({}, '', '/article-b');
    const contextPlugin = client.add.mock.calls[0][0] as BeforePlugin;
    expect(await contextPlugin.execute!(queued)).toBeNull();
    expect(await plugin.execute!(queued)).toBeNull();
  });

  test('does not renew an observed view during prerendering or while the page has exited', async () => {
    await setup({ pageViewEventType: 'page_view', inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 });
    await deliverSource(page());
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
    await deliverSource(page());
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
    expect(await deliverSource(queued)).toBeNull();
    complete();
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(count);
  });

  test('waits for a matching event after URL changes and does not copy its metadata into renewals', async () => {
    await setup({ pageViewEventType: 'page_view', inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 });
    await deliverSource({ ...page(), event_properties: { article_id: 'article-a', utm_source: 'campaign-a' } });
    await jest.advanceTimersByTimeAsync(101);
    history.pushState({}, '', '/article-b');
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    const count = sent.length;
    expect(renewals()).toHaveLength(0);
    await deliverSource({
      event_type: 'page_view',
      event_properties: {
        article_id: 'article-b',
        utm_source: 'campaign-b',
        '[Amplitude] Page Location': '/virtual/article-b',
        '[Amplitude] SDK Initialization Offset': 321,
      },
    });
    await jest.advanceTimersByTimeAsync(101);
    expect(latest().event_properties).toMatchObject({ article_id: 'article-b', utm_source: 'campaign-b' });
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    expect(sent.length).toBeGreaterThan(count);
    expect(renewals()[0][0]).not.toHaveProperty('event_properties');
    expect(latest().event_properties).toEqual({
      '[Amplitude] Engaged Time': expect.any(Number),
      '[Amplitude] Total Time': expect.any(Number),
      '[Amplitude] Snapshot Version': expect.any(Number),
      '[Amplitude] Engagement Snapshot Reason': 'initial',
    });
  });

  test('snapshots custom events and preserves their identity and business properties', async () => {
    await setup({ pageViewEventType: 'page_view', activityWindowMillis: 2000, heartbeatIntervalMillis: 1000 });
    const original = page();
    expect(await deliverSource(original)).toMatchObject({ delay: { timeout: 180_000 } });
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
    expect(await deliverSource(page('[Amplitude] Page Viewed'))).toMatchObject({
      event_type: '[Amplitude] Page Viewed',
    });
  });

  test('a second event on the same URL finalizes the old view and starts a fresh group', async () => {
    await setup();
    await deliverSource(page());
    await jest.advanceTimersByTimeAsync(1000);
    await deliverSource({ event_type: 'page_view', event_properties: { article_id: 'article-b' } });
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(3);
    expect(sent.find((event) => event.delay?.timeout === undefined)).toMatchObject({
      delay: { timeout: undefined },
      event_properties: { article_id: 'article-a', '[Amplitude] Engaged Time': 1000 },
    });
    const next = sent.find((event) => (event.event_properties as Record<string, unknown>)?.article_id === 'article-b')!;
    expect(next.delay!.id).not.toBe(sent[0].delay!.id);
    expect(next.insert_id).toBeTruthy();
  });

  test('navigation alone does not create or finalize views; a matching event defines the next view', async () => {
    await setup();
    await deliverSource(page());
    await jest.advanceTimersByTimeAsync(1000);
    history.pushState({}, '', '/article-b');
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(1);
    await deliverSource({ event_type: 'page_view', event_properties: { article_id: 'article-b' } });
    await jest.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(3);
    expect(sent.find((event) => event.delay?.timeout === undefined)).toMatchObject({
      delay: { timeout: undefined },
      event_properties: { article_id: 'article-a', '[Amplitude] Engagement Snapshot Reason': 'navigation' },
    });
    expect(
      sent.find((event) => (event.event_properties as Record<string, unknown>)?.article_id === 'article-b')
        ?.event_properties,
    ).toMatchObject({ article_id: 'article-b' });
  });

  test('renews once on activity after inactivity and after BFCache restore with the configured name', async () => {
    await setup({ pageViewEventType: 'page_view', inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 });
    await deliverSource(page());
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
    expect(renewals()[0][0]).not.toHaveProperty('event_properties');
    expect(latest().event_properties).not.toHaveProperty('article_id');
    expect(latest().event_properties).not.toHaveProperty(['[Amplitude] Min Page Y']);
    expect(latest().event_properties).not.toHaveProperty(['[Amplitude] Viewport Width']);
    const renewedId = latest().insert_id;
    window.dispatchEvent(new Event('pagehide'));
    expect(await deliverSource(page())).toBeNull();
    window.dispatchEvent(new Event('pageshow'));
    await jest.advanceTimersByTimeAsync(1);
    expect(latest().event_type).toBe('page_view');
    expect(latest().insert_id).not.toBe(renewedId);
  });

  test('drops active state at opt-out, including when initially opted out', async () => {
    config.optOut = true;
    await setup();
    expect(await deliverSource(page())).toBeNull();
    config.optOut = false;
    await plugin.onOptOutChanged!(false);
    await deliverSource(page());
    await jest.advanceTimersByTimeAsync(1);
    await plugin.onOptOutChanged!(true);
    await jest.advanceTimersByTimeAsync(200_000);
    expect(sent).toHaveLength(1);
  });

  test.each(['reset', 'user', 'device', 'session'] as const)(
    'finalizes at the %s boundary and rejects a pending event',
    async (boundary) => {
      await setup({ pageViewEventType: 'page_view', secondaryPageViewEventType: 'Engagement Resumed' });
      const capture = client.add.mock.calls[0][0] as BeforePlugin;
      const pending = await capture.execute!(page());
      await deliverSource(page());
      await jest.advanceTimersByTimeAsync(1000);
      if (boundary === 'reset') await plugin.onReset!();
      if (boundary === 'user') await plugin.onIdentityChanged!({ userId: 'new' });
      if (boundary === 'device') await plugin.onIdentityChanged!({ deviceId: 'new' });
      if (boundary === 'session') await plugin.onSessionIdChanged!(2000);
      await jest.advanceTimersByTimeAsync(1);
      expect(latest().delay!.timeout).toBeUndefined();
      const count = sent.length;
      await plugin.onIdentityChanged!({ userProperties: {} });
      expect(await deliverSource(pending!)).toBeNull();
      document.dispatchEvent(new Event('keydown'));
      await jest.advanceTimersByTimeAsync(1);
      expect(sent).toHaveLength(count + 1);
      expect(latest().event_type).toBe('Engagement Resumed');
    },
  );

  test('preserves a pending old-page event without replacing current engagement', async () => {
    await setup();
    const capture = client.add.mock.calls[0][0] as BeforePlugin;
    const pending = await capture.execute!(page());
    history.pushState({}, '', '/article-b');
    const current = await capture.execute!({ event_type: 'page_view', extra: { custom: true } });
    await deliverSource(current!);
    await jest.advanceTimersByTimeAsync(1);
    expect(await deliverSource(pending!)).toBe(pending);
    await jest.advanceTimersByTimeAsync(15_000);
    expect(sent).toHaveLength(2);
    expect(latest().insert_id).toBe(sent[0].insert_id);
    const snapshot = latest();
    expect(await capture.execute!(snapshot)).toBe(snapshot);
  });

  test('drops a queued idle renewal if a new explicit view arrives first', async () => {
    await setup({ pageViewEventType: 'page_view', inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 });
    await deliverSource(page());
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
    await deliverSource({ event_type: 'page_view', event_properties: { article_id: 'new-article' } });
    expect(await deliverSource(queued)).toBeNull();
    complete();
    await jest.advanceTimersByTimeAsync(1);
    expect(latest().event_properties).toMatchObject({ article_id: 'new-article' });
  });

  test('captures top-level properties without deep-cloning nested business data', async () => {
    await setup({ pageViewEventType: 'page_view', heartbeatIntervalMillis: 1000 });
    const article = { slug: 'article-a' };
    const original = { ...page(), event_properties: { article } };
    await deliverSource(original);
    original.event_properties.article = { slug: 'article-b' };
    original.time = 9999;
    await jest.advanceTimersByTimeAsync(1000);
    expect(latest().time).toBe(1234);
    expect(latest().event_properties).toMatchObject({ article: { slug: 'article-a' } });
    expect((latest().event_properties as Record<string, unknown>).article).toBe(article);
  });

  test('falls back on circular source data without blocking subsequent views or generating renewals', async () => {
    await setup({ inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20, pageViewEventType: 'page_view' });
    const warn = jest.spyOn(config.loggerProvider, 'warn').mockImplementation(() => undefined);
    const circular = page();
    circular.event_properties = { self: circular };
    expect(await deliverSource(circular)).toBe(circular);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cannot be queued'));
    await jest.advanceTimersByTimeAsync(101);
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    expect(renewals()).toHaveLength(0);
    expect(await deliverSource(page())).toHaveProperty('delay.timeout', 100);
  });

  test('falls back to ordinary delivery if the snapshot is too large', async () => {
    await setup();
    jest.spyOn(config.loggerProvider, 'warn').mockImplementation(() => undefined);
    const large = { ...page(), event_properties: { huge: 'x'.repeat(100_000) } };
    expect(await deliverSource(large)).toBe(large);
    expect(renewals()).toHaveLength(0);
  });

  test('tears down safely with another history wrapper installed', async () => {
    await setup();
    const wrappedPush = history.pushState.bind(history);
    history.pushState = new Proxy(wrappedPush, {
      apply: (target, thisArg, args: Parameters<History['pushState']>) => target.apply(thisArg, args),
    });
    await plugin.teardown!();
    history.pushState({}, '', '/after-teardown');
    expect(renewals()).toHaveLength(0);
    await plugin.onOptOutChanged!(false);
    await plugin.onReset!();
    await plugin.onIdentityChanged!({ userId: 'new' });
    await plugin.onSessionIdChanged!(123);
    const event = page();
    expect(await deliverSource(event)).toBe(event);
  });

  test.each([undefined, {}])('passes through without a document: %p', async (scope) => {
    jest.mocked(getGlobalScope).mockReturnValueOnce(scope as ReturnType<typeof getGlobalScope>);
    await setup();
    const event = page();
    expect(await deliverSource(event)).toBe(event);
  });
});
