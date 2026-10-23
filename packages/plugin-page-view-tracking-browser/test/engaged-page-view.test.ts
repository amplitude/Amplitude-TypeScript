import { BrowserConfig, BaseEvent, Logger, PageTrackingOptions, getGlobalScope } from '@amplitude/analytics-core';
import { pageViewTrackingPlugin } from '../src/page-view-tracking';
import { createMockBrowserClient } from './mock-browser-client';

jest.mock('@amplitude/analytics-core', () => {
  const actual = jest.requireActual<typeof import('@amplitude/analytics-core')>('@amplitude/analytics-core');
  return { ...actual, getGlobalScope: jest.fn(actual.getGlobalScope) };
});

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

  test('preserves an oversized page view once, warns, and resumes engagement on the next page', async () => {
    // Defer automatic creation so this test starts with the supplied large view.
    Object.defineProperty(document, 'prerendering', { configurable: true, value: true });
    await setup({ trackHistoryChanges: 'all' });
    Object.defineProperty(document, 'prerendering', { configurable: true, value: false });
    const warn = jest.spyOn(config.loggerProvider, 'warn').mockImplementation(() => undefined);
    const largePage: BaseEvent = {
      event_type: '[Amplitude] Page Viewed',
      insert_id: 'large-view',
      event_properties: Object.fromEntries(
        Array.from({ length: 60 }, (_, index) => [`field${index}`, 'x'.repeat(800)]),
      ),
    };
    await client.track(largePage).promise;
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject(largePage);
    expect(captured[0].delay).toBeUndefined();
    expect(captured[0].event_properties!['[Amplitude] Engaged Time']).toBeUndefined();
    expect(config.pageCounter).toBe(1);
    expect(warn).toHaveBeenCalledWith(
      'Page engagement: snapshot exceeds the Heartbeat size limit. Sending the original page view without engaged-time tracking.',
    );
    expect(jest.getTimerCount()).toBe(0);

    document.dispatchEvent(new Event('pointermove'));
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    await jest.advanceTimersByTimeAsync(180_001);
    expect(captured).toHaveLength(1);
    expect(config.pageCounter).toBe(1);

    history.pushState({}, '', '/after-oversized-view');
    await jest.advanceTimersByTimeAsync(2);
    expect(captured).toHaveLength(2);
    expect(captured[1].delay!.timeout).toBe(180_000);
    expect(config.pageCounter).toBe(2);
    await jest.advanceTimersByTimeAsync(15_000);
    expect(captured).toHaveLength(3);
    expect(captured[2].event_properties!['[Amplitude] Engaged Time']).toBe(5_000);
  });

  test('does not fall back to ordinary tracking for a page view arriving after opt-out', async () => {
    await setup();
    client.track.mockClear();
    config.optOut = true;
    await plugin.onOptOutChanged!(true);
    expect(await plugin.execute!({ event_type: '[Amplitude] Page Viewed' })).toBeNull();
    expect(client.track.mock.calls).toHaveLength(0);
  });

  test('renews once on activity after expiry', async () => {
    await setup({ trackEngagedTime: { inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 } });
    await jest.advanceTimersByTimeAsync(100);
    document.dispatchEvent(new Event('keydown'));
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    expect(config.pageCounter).toBe(2);
    expect(captured[captured.length - 1].insert_id).not.toBe(captured[0].insert_id);
  });

  test.each([(): boolean => true, (): boolean => false, 'attribution'] as const)(
    'disables engagement for custom trackOn=%s while preserving ordinary tracking',
    async (trackOn) => {
      await setup({ trackOn });
      const initialCount = typeof trackOn === 'function' && trackOn() ? 1 : 0;
      expect(captured).toHaveLength(initialCount);
      const user_properties = { $set: { plan: 'pro' } };
      await client.track({ event_type: '[Amplitude] Page Viewed', user_properties }).promise;
      expect(captured[captured.length - 1].user_properties).toEqual(user_properties);
      expect(captured.every((event) => !event.delay)).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
      document.dispatchEvent(new Event('keydown'));
      await jest.advanceTimersByTimeAsync(180_000);
      expect(captured).toHaveLength(initialCount + 1);
    },
  );

  test('strips page-view user properties and preserves separate identify updates', async () => {
    await setup();
    const user_properties = { $set: { plan: 'old' }, $unset: { obsolete: '-' } };
    await client.track({ event_type: '[Amplitude] Page Viewed', user_properties }).promise;
    await client.track({ event_type: '$identify', user_properties: { $set: { plan: 'new' } } }).promise;
    await jest.advanceTimersByTimeAsync(15_000);
    await plugin.teardown!();
    await jest.advanceTimersByTimeAsync(1);
    expect(
      captured
        .filter((event) => event.event_type === '[Amplitude] Page Viewed')
        .every((event) => !Object.prototype.hasOwnProperty.call(event, 'user_properties')),
    ).toBe(true);
    expect(captured.find((event) => event.event_type === '$identify')?.user_properties).toEqual({
      $set: { plan: 'new' },
    });
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

  test('pathOnly keeps engagement running across query changes', async () => {
    history.replaceState({}, '', '/same-path');
    await setup({ trackHistoryChanges: 'pathOnly' });
    history.pushState({}, '', '/same-path?query=changed');
    await jest.advanceTimersByTimeAsync(15_000);
    expect(config.pageCounter).toBe(1);
    expect(captured).toHaveLength(2);
    expect(captured[1].delay!.timeout).toBe(180_000);
  });

  test('BFCache return creates one fresh view despite pageshow, visibility, focus and popstate events', async () => {
    await setup();
    const original = captured[0];
    await jest.advanceTimersByTimeAsync(1_000);
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    await jest.advanceTimersByTimeAsync(1);
    expect(captured[1]).toMatchObject({
      insert_id: original.insert_id,
      delay: { id: original.delay!.id },
      event_properties: { '[Amplitude] Engagement Snapshot Reason': 'pagehide' },
    });
    expect(captured[1].delay!.timeout).toBeUndefined();

    jest.spyOn(document, 'hasFocus').mockReturnValue(false);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await jest.advanceTimersByTimeAsync(1);
    expect(captured).toHaveLength(2);

    jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PopStateEvent('popstate'));
    await jest.advanceTimersByTimeAsync(2);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    await jest.advanceTimersByTimeAsync(1);

    expect(captured).toHaveLength(3);
    expect(config.pageCounter).toBe(2);
    const restored = captured[2];
    expect(restored.insert_id).not.toBe(original.insert_id);
    expect(restored.delay!.id).not.toBe(original.delay!.id);
    expect(restored.time).toBeGreaterThan(original.time!);
    expect(restored.event_properties!['[Amplitude] Page View ID']).not.toBe(
      original.event_properties!['[Amplitude] Page View ID'],
    );
    expect(restored.event_properties!['[Amplitude] Page URL']).toBe(original.event_properties!['[Amplitude] Page URL']);
    expect(restored.event_properties!['[Amplitude] Engaged Time']).toBe(0);
  });

  test.each([false, undefined])(
    'preserves immediate page views when trackEngagedTime is %s',
    async (trackEngagedTime) => {
      await setup({ trackEngagedTime });
      await plugin.onOptOutChanged!(true);
      await plugin.onReset!();
      await plugin.onIdentityChanged!({ deviceId: 'new-device' });
      await plugin.onSessionIdChanged!(123);
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      await jest.advanceTimersByTimeAsync(1);
      expect(captured).toHaveLength(1);
      expect(captured[0].delay).toBeUndefined();
    },
  );

  test('an empty options object enables engagement with default timings', async () => {
    await setup({ trackEngagedTime: {} });
    expect(captured[0].delay!.timeout).toBe(180_000);
    await jest.advanceTimersByTimeAsync(15_000);
    expect(captured[captured.length - 1].event_properties!['[Amplitude] Engaged Time']).toBe(5_000);
  });

  test('checks consent again after asynchronous page creation', async () => {
    await setup({ trackEngagedTime: { inactivityTimeoutMillis: 10, heartbeatIntervalMillis: 2 } });
    await jest.advanceTimersByTimeAsync(10);
    const count = client.track.mock.calls.length;
    document.dispatchEvent(new Event('keydown'));
    config.optOut = true;
    await jest.advanceTimersByTimeAsync(1);
    expect(client.track.mock.calls).toHaveLength(count);
  });

  test('continues after inactivity without session storage', async () => {
    // Use a plain scope so the throwing getter does not depend on how Node's
    // VM forwards property access on Jest's window/globalThis object.
    jest.mocked(getGlobalScope).mockReturnValueOnce({
      document,
      history,
      addEventListener: window.addEventListener.bind(window),
      removeEventListener: window.removeEventListener.bind(window),
      get sessionStorage(): Storage {
        throw new Error('unavailable');
      },
    } as typeof globalThis);
    const debug = jest.spyOn(config.loggerProvider, 'debug');
    await setup({ trackEngagedTime: { inactivityTimeoutMillis: 10, heartbeatIntervalMillis: 2 } });
    expect(debug).toHaveBeenCalledWith('sessionStorage is not available in this environment.');
    await jest.advanceTimersByTimeAsync(10);
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    expect(config.pageCounter).toBe(2);
    expect(captured[captured.length - 1].event_properties!['[Amplitude] Page View ID']).toBeTruthy();
  });

  test('navigation cancels an in-flight inactivity renewal instead of creating a duplicate view', async () => {
    await setup({ trackEngagedTime: { inactivityTimeoutMillis: 10, heartbeatIntervalMillis: 2 } });
    await jest.advanceTimersByTimeAsync(10);
    document.dispatchEvent(new Event('pointerdown'));
    history.pushState({}, '', '/after-expiry');
    await jest.advanceTimersByTimeAsync(2);
    expect(config.pageCounter).toBe(2);
    expect(captured[captured.length - 1].event_properties!['[Amplitude] Page Path']).toBe('/after-expiry');
  });

  test('navigation followed by interaction creates only one new view', async () => {
    await setup();
    // A router can change the URL in a key handler before the same event
    // bubbles to the engagement listener on document.
    history.pushState({}, '', '/navigation-then-activity');
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(2);
    expect(config.pageCounter).toBe(2);
    expect(captured).toHaveLength(3); // Initial A, final A, initial B.
    expect(captured[2].event_properties!['[Amplitude] Page Path']).toBe('/navigation-then-activity');
    expect(captured[2].delay!.timeout).toBe(180_000);
  });

  test.each([false, true])('pagehide (persisted=%s) cancels a view still being created', async (persisted) => {
    await setup({ trackEngagedTime: { inactivityTimeoutMillis: 10, heartbeatIntervalMillis: 2 } });
    await jest.advanceTimersByTimeAsync(10);
    const count = captured.length;
    document.dispatchEvent(new Event('keydown'));
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted }));
    // Late activity must not start another creation while the document is away.
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(20);
    expect(config.pageCounter).toBe(1);
    expect(captured).toHaveLength(count);
  });

  test.each([false, true])('rejects an already queued view after pagehide, restored=%s', async (restored) => {
    await setup({ trackEngagedTime: { inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 } });
    await jest.advanceTimersByTimeAsync(100);
    const count = captured.length;
    const track = client.track.getMockImplementation()!;
    let release!: () => void;
    const queued = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Model a real SDK event waiting in the timeline or an async before plugin.
    client.track.mockImplementationOnce((...args) => ({ promise: queued.then(() => track(...args).promise) }));
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(1);
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    if (restored) {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      await jest.advanceTimersByTimeAsync(1);
    }
    release();
    await jest.advanceTimersByTimeAsync(1);
    expect(config.pageCounter).toBe(restored ? 2 : 1);
    expect(captured).toHaveLength(count + (restored ? 1 : 0));
  });

  test('still tracks explicitly supplied page views without a generated page ID', async () => {
    await setup();
    await client.track({ event_type: '[Amplitude] Page Viewed' }).promise;
    await jest.advanceTimersByTimeAsync(1);
    expect(config.pageCounter).toBe(2);
    expect(captured).toHaveLength(3);
  });
});
