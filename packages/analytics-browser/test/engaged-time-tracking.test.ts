import {
  AutocaptureOptions,
  getHeartbeatInstance,
  EngagedTimeOptions,
  Event as AnalyticsEvent,
  Payload,
  Status,
  Transport,
} from '@amplitude/analytics-core';
import { AmplitudeBrowser } from '../src/browser-client';
import { getEngagedTimeTrackingConfig, isEngagedTimeTrackingEnabled } from '../src/default-tracking';

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
    pageUrlEnrichment = true,
  ) => {
    await client.init('test-key', {
      autocapture: {
        attribution: false,
        sessions: false,
        fileDownloads: false,
        formInteractions: false,
        pageViews,
        engagedTimeTracking,
        pageUrlEnrichment,
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
  test.each(['[Amplitude] Page Viewed', 'page_view'])(
    'renews %s with a secondary name through enrichment without advancing the primary counter',
    async (primary) => {
      await init(
        {
          pageViewEventType: primary,
          secondaryPageViewEventType: 'Engagement Resumed',
          heartbeatIntervalMillis: 100,
          inactivityTimeoutMillis: 1000,
        },
        { eventType: primary, trackOn: () => false },
      );
      const enrich = jest.fn(async (event: AnalyticsEvent) => ({
        ...event,
        event_properties: { ...event.event_properties, late_marker: true },
      }));
      await client.add({ name: 'late-secondary', type: 'enrichment', execute: enrich }).promise;
      await track(primary, { article_id: 'a' });
      const first = events()[0];
      await jest.advanceTimersByTimeAsync(1100);
      expect(events()[events().length - 1].delay!.timeout).toBeUndefined();
      document.dispatchEvent(new Event('keydown'));
      await jest.advanceTimersByTimeAsync(20);
      const resumed = events()[events().length - 1];
      expect(resumed.event_type).toBe('Engagement Resumed');
      expect(resumed.event_properties).toMatchObject({ late_marker: true, '[Amplitude] Page Location': location.href });
      expect(resumed.event_properties).not.toHaveProperty('article_id');
      expect(resumed.delay!.id).not.toBe(first.delay!.id);
      expect(resumed.insert_id).not.toBe(first.insert_id);
      await jest.advanceTimersByTimeAsync(1100);
      const secondarySnapshots = events().filter((event) => event.event_type === 'Engagement Resumed');
      expect(secondarySnapshots.length).toBeGreaterThan(2);
      expect(
        secondarySnapshots.every(
          (event) => event.insert_id === resumed.insert_id && event.delay!.id === resumed.delay!.id,
        ),
      ).toBe(true);
      expect(secondarySnapshots.every((event) => event.event_properties!.late_marker === true)).toBe(true);
      expect(secondarySnapshots[secondarySnapshots.length - 1].delay!.timeout).toBeUndefined();
      await track(primary, { article_id: 'b' });
      expect(events()[events().length - 1].event_properties).toMatchObject({
        '[Amplitude] Page Counter': 2,
        article_id: 'b',
      });
      expect(
        events().filter(
          (event) =>
            event.event_type === primary &&
            event.event_properties!['[Amplitude] Engagement Snapshot Reason'] === 'initial',
        ),
      ).toHaveLength(2);
    },
  );

  test('unserializable source data does not block the pipeline or the next valid PageView', async () => {
    await init({ pageViewEventType: 'page_view' });
    // A later plugin can sanitize application data before destination serialization.
    await client.add({
      name: 'sanitize-source',
      type: 'enrichment',
      execute: async (event) => ({
        ...event,
        event_properties: { sanitized: true },
      }),
    }).promise;
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await track('page_view', circular);
    expect(events()).toHaveLength(1);
    expect(events()[0].delay).toBeUndefined();
    await track('page_view', { valid: true });
    expect(events()).toHaveLength(2);
    expect(events()[1].delay).toHaveProperty('timeout', 180_000);
  });

  test('runs late enrichment for the initial view, heartbeat, and final through the real pipeline', async () => {
    const beforeEngagement = jest.fn(async (event: AnalyticsEvent) => ({
      ...event,
      event_properties: { ...event.event_properties, before_engagement: true },
    }));
    await client.add({ name: 'enrichment-a', type: 'enrichment', execute: beforeEngagement }).promise;
    await init({ pageViewEventType: 'page_view', heartbeatIntervalMillis: 1000 });
    const afterEngagement = jest.fn(async (event: AnalyticsEvent) => ({
      ...event,
      event_properties: { ...event.event_properties, '[Amplitude] Session Replay ID': 'replay-id' },
    }));
    await client.add({ name: 'enrichment-c', type: 'enrichment', execute: afterEngagement }).promise;
    const process = jest.spyOn(client, 'process');
    await track('page_view', { article_id: 'a' });
    expect(events()).toHaveLength(1);
    expect(events()[0].event_properties).toMatchObject({
      before_engagement: true,
      '[Amplitude] Session Replay ID': 'replay-id',
      article_id: 'a',
    });
    expect(events()[0].delay!.timeout).toBe(180_000);
    expect(afterEngagement).toHaveBeenCalledTimes(1);
    expect(process).toHaveBeenCalledTimes(1);
    const original = events()[0];
    await jest.advanceTimersByTimeAsync(1000);
    window.dispatchEvent(new Event('pagehide'));
    await jest.advanceTimersByTimeAsync(20);
    expect(events()).toHaveLength(3);
    expect(beforeEngagement).toHaveBeenCalledTimes(3);
    expect(afterEngagement).toHaveBeenCalledTimes(3);
    expect(process).toHaveBeenCalledTimes(3);
    for (const event of events()) {
      expect(event).toMatchObject({
        insert_id: original.insert_id,
        time: original.time,
        session_id: original.session_id,
        delay: { id: original.delay!.id },
        event_properties: { '[Amplitude] Session Replay ID': 'replay-id' },
      });
    }
    expect(events()[2].delay!.timeout).toBeUndefined();
  });

  test.each(['[Amplitude] Page Viewed', 'page_view'])(
    'preserves %s page context and counter across replay, SPA navigation, and the next view',
    async (eventType) => {
      await init({ pageViewEventType: eventType, heartbeatIntervalMillis: 1000 }, { eventType, trackOn: () => false });
      let replay = 'replay-a';
      const late = jest.fn(async (event: AnalyticsEvent) => ({
        ...event,
        event_properties: { ...event.event_properties, '[Amplitude] Session Replay ID': replay },
      }));
      await client.add({ name: 'late-replay', type: 'enrichment', execute: late }).promise;
      const business = { article: { slug: 'article-a' } };
      await track(eventType, business);
      const original = events()[0];
      const pageKeys = [
        '[Amplitude] Page Counter',
        '[Amplitude] Page URL',
        '[Amplitude] Page Location',
        '[Amplitude] Page Domain',
        '[Amplitude] Page Path',
        '[Amplitude] Page Title',
        '[Amplitude] Previous Page Location',
        '[Amplitude] Previous Page Type',
      ];
      const context = Object.fromEntries(pageKeys.map((key) => [key, original.event_properties![key]]));
      expect(context).toMatchObject({ '[Amplitude] Page Counter': 1, '[Amplitude] Page Path': '/article-a' });
      expect(pageKeys.every((key) => Object.prototype.hasOwnProperty.call(original.event_properties, key))).toBe(true);
      business.article = { slug: 'mutated' };
      replay = 'replay-b';
      history.pushState({}, '', '/article-b');
      await jest.advanceTimersByTimeAsync(1000);
      expect(client.config.pageCounter).toBe(1);
      await track(eventType, { article: { slug: 'article-b' } });
      const old = events().filter((event) => event.insert_id === original.insert_id);
      expect(old).toHaveLength(3);
      for (const event of old) {
        expect(event).toMatchObject({
          time: original.time,
          user_id: original.user_id,
          device_id: original.device_id,
          session_id: original.session_id,
          delay: { id: original.delay!.id },
          event_properties: { ...context, article: { slug: 'article-a' } },
        });
      }
      expect(old[0].event_properties).toMatchObject({ '[Amplitude] Session Replay ID': 'replay-a' });
      expect(old[1].event_properties).toMatchObject({ '[Amplitude] Session Replay ID': 'replay-b' });
      expect(old[2].delay!.timeout).toBeUndefined();
      expect(old[2].event_properties).toMatchObject({ '[Amplitude] Session Replay ID': 'replay-b' });
      const next = events().find((event) => event.insert_id !== original.insert_id)!;
      expect(next.event_properties).toMatchObject({
        '[Amplitude] Page Counter': 2,
        '[Amplitude] Page Path': '/article-b',
      });
      expect(client.config.pageCounter).toBe(2);
      expect(late).toHaveBeenCalledTimes(4);
      // Later plugins return new objects; their output is not implicitly saved by engagement.
      expect(
        late.mock.calls.every(
          ([event]) =>
            (event.event_properties as Record<string, unknown>)?.['[Amplitude] Session Replay ID'] === undefined,
        ),
      ).toBe(true);
    },
  );

  test('does not bypass Video Analytics delayed-event enrichment on initial delivery or heartbeat', async () => {
    await init(true);
    const late = jest.fn(async (event: AnalyticsEvent) => ({
      ...event,
      event_properties: { ...event.event_properties, video_enriched: true },
    }));
    await client.add({ name: 'video-enrichment', type: 'enrichment', execute: late }).promise;
    const heartbeat = getHeartbeatInstance(client);
    void heartbeat.track({ event_type: '[Streaming] Stream Stopped', insert_id: 'video-stop', time: 100_000 });
    await jest.advanceTimersByTimeAsync(20);
    expect(events()).toHaveLength(1);
    expect(events()[0].event_properties).toMatchObject({ '[Amplitude] Page Path': '/article-a', video_enriched: true });
    expect(events()[0].event_properties).not.toHaveProperty(['[Amplitude] Engaged Time']);
    history.pushState({}, '', '/video-b');
    await jest.advanceTimersByTimeAsync(60_000);
    expect(events()).toHaveLength(2);
    expect(events()[1].event_properties).toMatchObject({ '[Amplitude] Page Path': '/video-b', video_enriched: true });
    expect(late).toHaveBeenCalledTimes(2);
    heartbeat.stop();
  });

  test('runs process session checks on replays while retaining the view identity and original time', async () => {
    await init({ pageViewEventType: 'page_view', heartbeatIntervalMillis: 1000 });
    client.config.sessionTimeout = 500;
    const process = jest.spyOn(client, 'process');
    await track('page_view');
    const original = events()[0];
    const setSessionId = jest.spyOn(client, 'setSessionId');
    const lastEventTime = client.config.lastEventTime;
    await jest.advanceTimersByTimeAsync(1100);
    expect(process.mock.calls.length).toBeGreaterThan(1);
    expect(client.getSessionId()).not.toBe(original.session_id);
    expect(setSessionId).toHaveBeenCalledTimes(1);
    expect(client.config.lastEventTime).toBeUndefined();
    expect(lastEventTime).toBe(original.time);
    const final = events().find((event) => event.delay?.timeout === undefined)!;
    expect(final).toMatchObject({
      insert_id: original.insert_id,
      time: original.time,
      session_id: original.session_id,
      delay: { id: original.delay!.id },
      event_properties: { '[Amplitude] Engagement Snapshot Reason': 'session_change' },
    });
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(20);
    expect(
      events().some((event) => event.insert_id !== original.insert_id && event.session_id === client.getSessionId()),
    ).toBe(true);
  });

  test('retains ordinary Context processing of original event IDs without extending lastEventTime', async () => {
    await init({ pageViewEventType: 'page_view', heartbeatIntervalMillis: 1000 });
    await track('page_view');
    const original = events()[0];
    await track('ordinary_event');
    expect(client.config.lastEventId).toBeGreaterThan(original.event_id!);
    const lastEventTime = client.config.lastEventTime;
    await jest.advanceTimersByTimeAsync(1000);
    expect(client.config.lastEventId).toBe(original.event_id);
    expect(client.config.lastEventTime).toBe(lastEventTime);
    expect(events()[events().length - 1]).toMatchObject({ event_id: original.event_id, time: original.time });
  });

  test('captures after existing enrichment during normal initialization', async () => {
    await client.add({
      name: 'application-enrichment',
      type: 'enrichment',
      execute: async (event) => ({
        ...event,
        event_properties: { ...event.event_properties, application_context: 'captured' },
      }),
    }).promise;
    await init(true, true);
    const enrichment = client.timeline.plugins.filter((plugin) => plugin.type === 'enrichment');
    expect(enrichment[enrichment.length - 1].name).toBe('@amplitude/plugin-engaged-time-tracking-browser');
    expect(events()).toHaveLength(1);
    expect(events()[0].event_properties).toMatchObject({
      application_context: 'captured',
      '[Amplitude] Page Counter': 1,
      '[Amplitude] Page Path': '/article-a',
    });
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
    expect(
      events().find((event) => event.insert_id === original.insert_id && event.delay?.timeout === undefined),
    ).toMatchObject({
      insert_id: original.insert_id,
      time: original.time,
      delay: { id: original.delay!.id, timeout: undefined },
      event_properties: { article_id: 'article-a', '[Amplitude] Page Path': '/article-a' },
    });
    const next = events().find((event) => event.event_properties?.article_id === 'article-b')!;
    expect(next.event_properties).toMatchObject({
      article_id: 'article-b',
      '[Amplitude] Page Path': '/article-b',
    });
    expect(next.delay!.id).not.toBe(original.delay!.id);
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
  test('waits for consent before tracking custom events', async () => {
    await init({ pageViewEventType: 'page_view' }, false, true);
    await track('page_view');
    expect(send).not.toHaveBeenCalled();
    client.setOptOut(false);
    await track('page_view');
    expect(events()).toHaveLength(1);
    expect(events()[0].delay).toBeDefined();
  });
  test.each(['[Amplitude] Page Viewed', 'page_view'])(
    'renews %s once after inactivity with fresh delivery IDs and no inherited article properties',
    async (eventType) => {
      await init(
        { pageViewEventType: eventType, inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 },
        eventType === '[Amplitude] Page Viewed',
      );
      await track(eventType, { article_id: 'article-a' });
      const original = events().find((event) => event.event_properties?.article_id === 'article-a')!;
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
      expect(original.event_properties).toMatchObject({ article_id: 'article-a' });
      expect(renewed.event_properties).not.toHaveProperty('article_id');
      expect(renewed.event_properties).toHaveProperty(['[Amplitude] Engaged Time']);
      expect((renewed.event_properties as Record<string, unknown>)['[Amplitude] Page Counter']).toBe(
        eventType === '[Amplitude] Page Viewed' ? 3 : undefined,
      );
      const beforeFocus = events().length;
      window.dispatchEvent(new Event('focus'));
      await jest.advanceTimersByTimeAsync(1);
      expect(events()).toHaveLength(beforeFocus);
    },
  );

  test('keeps renewed custom views minimal when page URL enrichment is disabled', async () => {
    await init(
      { pageViewEventType: 'page_view', inactivityTimeoutMillis: 100, heartbeatIntervalMillis: 20 },
      false,
      false,
      false,
    );
    await track('page_view', {
      article_id: 'article-a',
      utm_source: 'campaign',
      '[Amplitude] Page Counter': 7,
      '[Amplitude] Page View ID': 'application-id',
    });
    const original = events()[events().length - 1];
    expect(original.event_properties).toMatchObject({
      article_id: 'article-a',
      '[Amplitude] Page View ID': 'application-id',
    });
    await jest.advanceTimersByTimeAsync(101);
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(15);
    const renewed = events()[events().length - 1];
    expect(renewed.event_type).toBe('page_view');
    expect(renewed.insert_id).not.toBe(original.insert_id);
    expect(renewed.delay!.id).not.toBe(original.delay!.id);
    expect(renewed.event_properties).toEqual({
      '[Amplitude] Engaged Time': expect.any(Number),
      '[Amplitude] Total Time': expect.any(Number),
      '[Amplitude] Snapshot Version': expect.any(Number),
      '[Amplitude] Engagement Snapshot Reason': 'initial',
    });
  });

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
