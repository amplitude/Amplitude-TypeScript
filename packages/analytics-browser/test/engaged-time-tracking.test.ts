import {
  AutocaptureOptions,
  EngagedTimeOptions,
  Event as AnalyticsEvent,
  Payload,
  Status,
  Transport,
} from '@amplitude/analytics-core';
import { AmplitudeBrowser } from '../src/browser-client';
import { getEngagedTimeTrackingConfig, isEngagedTimeTrackingEnabled } from '../src/default-tracking';
import { updateBrowserConfigWithRemoteConfig } from '../src/config/joined-config';
import { createConfigurationMock } from './helpers/mock';

describe('engagedTimeTracking configuration', () => {
  test.each([undefined, false, true, {}, { engagedTimeTracking: false }])(
    'is opt-in with autocapture=%p',
    (autocapture) => {
      expect(isEngagedTimeTrackingEnabled(autocapture)).toBe(false);
      expect(getEngagedTimeTrackingConfig({ autocapture })).toBeUndefined();
    },
  );
  test.each([true, {}, { pageViewEventType: 'page_view', activityWindowMillis: 123 }])(
    'forwards %p independently of pageViews',
    (engagedTimeTracking) => {
      for (const pageViews of [false, true, { eventType: 'renamed' }]) {
        const autocapture = { pageViews, engagedTimeTracking };
        expect(isEngagedTimeTrackingEnabled(autocapture)).toBe(true);
        expect(getEngagedTimeTrackingConfig({ autocapture })).toEqual(
          engagedTimeTracking === true ? undefined : engagedTimeTracking,
        );
      }
    },
  );
  test.each([
    { remote: true, expected: undefined },
    { remote: false, expected: undefined },
    { remote: { enabled: true }, expected: undefined },
    { remote: { enabled: false, pageViewEventType: 'page_view' }, expected: undefined },
    {
      remote: { enabled: true, pageViewEventType: 'page_view', inactivityTimeoutMillis: 1000 },
      expected: { pageViewEventType: 'page_view', inactivityTimeoutMillis: 1000 },
    },
  ])('translates independent remote setting $remote', ({ remote, expected }) => {
    const config = createConfigurationMock({ autocapture: false });
    updateBrowserConfigWithRemoteConfig({ autocapture: { pageViews: false, engagedTimeTracking: remote } }, config);
    expect(getEngagedTimeTrackingConfig(config)).toEqual(expected);
    expect(isEngagedTimeTrackingEnabled(config.autocapture)).toBe(
      remote !== false && !(typeof remote === 'object' && remote.enabled === false),
    );
    expect(config.autocapture).toMatchObject({ pageViews: false });
  });
});

describe('engagedTimeTracking through the Browser SDK', () => {
  let client: AmplitudeBrowser;
  let send: jest.Mock<ReturnType<Transport['send']>, Parameters<Transport['send']>>;
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  const events = () =>
    send.mock.calls.flatMap(([, payload]) => {
      // Destination moves delay metadata from each event to the request envelope.
      const delayed = payload as Payload & { id?: string; timeout?: number; instant_events?: Payload['events'] };
      return [
        ...payload.events.map((event) => ({
          ...event,
          delay: delayed.id ? { id: delayed.id, timeout: delayed.timeout } : undefined,
        })),
        ...(delayed.instant_events || []).map((event) => ({
          ...event,
          delay: { id: delayed.id!, timeout: undefined },
        })),
      ];
    });
  const init = async (
    engagedTimeTracking: boolean | EngagedTimeOptions,
    pageViews: AutocaptureOptions['pageViews'] = false,
    optOut = false,
  ) => {
    await client.init('test-key', {
      autocapture: {
        attribution: false,
        sessions: false,
        fileDownloads: false,
        formInteractions: false,
        pageViews,
        engagedTimeTracking,
      },
      optOut,
      fetchRemoteConfig: false,
      enableDiagnostics: false,
      identityStorage: 'none',
      offline: false,
      flushIntervalMillis: 10,
      logLevel: 0,
    }).promise;
    await jest.advanceTimersByTimeAsync(20);
  };
  const track = async (event_type: string, event_properties?: AnalyticsEvent['event_properties']) => {
    client.track(event_type, event_properties);
    await jest.advanceTimersByTimeAsync(20);
  };
  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(100_000);
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState({}, '', '/article-a');
    jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    client = new AmplitudeBrowser();
    send = jest.fn<ReturnType<Transport['send']>, Parameters<Transport['send']>>().mockResolvedValue({
      status: Status.Success,
      statusCode: 200,
      body: { eventsIngested: 1, payloadSizeBytes: 0, serverUploadTime: 100_000 },
    });
    await client.add({
      name: 'transport',
      type: 'before',
      async setup(config) {
        config.transportProvider = { send };
      },
    }).promise;
  });
  afterEach(async () => {
    await client.remove('@amplitude/plugin-engaged-time-tracking-browser').promise;
    await client.remove('@amplitude/plugin-page-view-tracking-browser').promise;
    await client.remove('@amplitude/plugin-page-url-enrichment-browser').promise;
    await jest.advanceTimersByTimeAsync(20);
    await client.flush().promise;
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    jest.useRealTimers();
  });
  test('waits for custom events with pageViews disabled, including navigation', async () => {
    await init({ pageViewEventType: 'page_view' });
    expect(events()).toHaveLength(0);
    await track('page_view', { article_id: 'article-a' });
    expect(events()).toHaveLength(1);
    const original = events()[0];
    expect(original).toMatchObject({
      event_type: 'page_view',
      delay: { timeout: 180_000 },
      event_properties: { article_id: 'article-a', '[Amplitude] Page Path': '/article-a' },
    });
    history.pushState({}, '', '/article-b');
    document.dispatchEvent(new Event('keydown'));
    window.dispatchEvent(new Event('focus'));
    await jest.advanceTimersByTimeAsync(1000);
    expect(events()).toHaveLength(1);
    await track('page_view', { article_id: 'article-b' });
    expect(events()).toHaveLength(3);
    expect(events()[1]).toMatchObject({
      insert_id: original.insert_id,
      time: original.time,
      delay: { id: original.delay!.id, timeout: undefined },
      event_properties: { article_id: 'article-a', '[Amplitude] Page Path': '/article-a' },
    });
    expect(events()[2].event_properties).toMatchObject({
      article_id: 'article-b',
      '[Amplitude] Page Path': '/article-b',
    });
    expect(events()[2].delay!.id).not.toBe(original.delay!.id);
  });
  test('true waits for the default name without installing or generating page views', async () => {
    await init(true);
    document.dispatchEvent(new Event('keydown'));
    window.dispatchEvent(new Event('focus'));
    await jest.advanceTimersByTimeAsync(200_000);
    expect(events()).toHaveLength(0);
    expect(client.timeline.plugins.some((p) => p.name === '@amplitude/plugin-engaged-time-tracking-browser')).toBe(
      true,
    );
    expect(client.timeline.plugins.some((p) => p.name === '@amplitude/plugin-page-view-tracking-browser')).toBe(false);
    await track('page_view');
    expect(events()[0].delay).toBeUndefined();
    await track('[Amplitude] Page Viewed');
    expect(events()).toHaveLength(2);
    expect(events()[1].delay).toBeDefined();
  });
  test('works with the default page-view plugin and counts each view once', async () => {
    await init(true, true);
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({
      event_type: '[Amplitude] Page Viewed',
      delay: { timeout: 180_000 },
      event_properties: { '[Amplitude] Page Counter': 1 },
    });
    await jest.advanceTimersByTimeAsync(15_000);
    expect(events()).toHaveLength(2);
    expect((events()[1].event_properties as Record<string, unknown>)['[Amplitude] Page Counter']).toBe(1);
  });
  test('does not delay ordinary page views when engagement is disabled', async () => {
    await init(false, true);
    expect(events()).toHaveLength(1);
    expect(events()[0].delay).toBeUndefined();
  });
  test('does not treat a renamed automatic page view as the default name', async () => {
    await init(true, { eventType: 'renamed_page' });
    expect(events()).toHaveLength(1);
    expect(events()[0].event_type).toBe('renamed_page');
    expect(events()[0].delay).toBeUndefined();
  });
  test('tracks an explicitly selected renamed automatic event', async () => {
    await init({ pageViewEventType: 'renamed_page' }, { eventType: 'renamed_page' });
    expect(events()).toHaveLength(1);
    expect(events()[0].delay).toBeDefined();
  });
  test('installs while opted out and waits for consent before tracking custom events', async () => {
    await init({ pageViewEventType: 'page_view' }, false, true);
    await track('page_view');
    expect(send).not.toHaveBeenCalled();
    client.setOptOut(false);
    await track('page_view');
    expect(events()).toHaveLength(1);
    expect(events()[0].delay).toBeDefined();
  });
  test.each(['[Amplitude] Page Viewed', 'page_view'])(
    'renews %s once after inactivity with fresh IDs and retained article properties',
    async (eventType) => {
      await init(
        { pageViewEventType: eventType, inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 },
        eventType === '[Amplitude] Page Viewed',
      );
      await track(eventType, { article_id: 'article-a' });
      const original = events()[events().length - 1];
      await jest.advanceTimersByTimeAsync(101);
      const count = events().length;
      document.dispatchEvent(new Event('keydown'));
      document.dispatchEvent(new Event('keydown'));
      window.dispatchEvent(new Event('focus'));
      await jest.advanceTimersByTimeAsync(15);
      expect(events()).toHaveLength(count + 1);
      const renewed = events()[count];
      expect(renewed.event_type).toBe(eventType);
      expect(renewed.insert_id).not.toBe(original.insert_id);
      expect(renewed.time).toBeGreaterThan(original.time!);
      expect(renewed.delay!.id).not.toBe(original.delay!.id);
      expect(renewed.event_properties).toMatchObject({ article_id: 'article-a' });
      expect((renewed.event_properties as Record<string, unknown>)['[Amplitude] Page View ID']).not.toBe(
        (original.event_properties as Record<string, unknown>)['[Amplitude] Page View ID'],
      );
      const beforeFocus = events().length;
      window.dispatchEvent(new Event('focus'));
      await jest.advanceTimersByTimeAsync(1);
      expect(events()).toHaveLength(beforeFocus);
    },
  );

  test('keeps identify separate and strips user properties from delayed custom events', async () => {
    await init({ pageViewEventType: 'page_view' });
    client.track({ event_type: 'page_view', user_properties: { $set: { plan: 'old' } } });
    await jest.advanceTimersByTimeAsync(20);
    client.track({ event_type: '$identify', user_properties: { $set: { plan: 'new' } } });
    await jest.advanceTimersByTimeAsync(20);
    expect(events().find((e) => e.event_type === 'page_view')!.user_properties).toBeUndefined();
    expect(events().find((e) => e.event_type === '$identify')!.user_properties).toEqual({ $set: { plan: 'new' } });
  });

  test.each(['identity', 'session', 'reset', 'consent'] as const)(
    'cancels a custom event held across the %s boundary',
    async (boundary) => {
      let release!: () => void;
      let held = false;
      await client.add({
        name: 'hold-custom-view',
        type: 'enrichment',
        async execute(event) {
          if (!held && event.insert_id === 'held' && !event.delay) {
            held = true;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
          return event;
        },
      }).promise;
      await init({ pageViewEventType: 'page_view' });
      client.track({ event_type: 'page_view', insert_id: 'held' });
      await jest.advanceTimersByTimeAsync(20);
      expect(held).toBe(true);
      if (boundary === 'identity') client.setUserId('new-user');
      if (boundary === 'session') client.setSessionId(200_000);
      if (boundary === 'reset') client.reset();
      if (boundary === 'consent') {
        client.setOptOut(true);
        client.setOptOut(false);
      }
      await jest.advanceTimersByTimeAsync(20);
      const count = events().length;
      release();
      await jest.advanceTimersByTimeAsync(20);
      expect(events()).toHaveLength(count);
      await track('page_view');
      expect(events()).toHaveLength(count + 1);
      expect(events()[count].delay).toBeDefined();
    },
  );
});
