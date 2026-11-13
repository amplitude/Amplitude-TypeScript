import { BASE_CAMPAIGN, Event, Payload, Status, Transport } from '@amplitude/analytics-core';
import { AmplitudeBrowser } from '../src/browser-client';

describe('engaged page sources through the Browser SDK', () => {
  let client: AmplitudeBrowser;
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);
  const properties = (event: Event) => event.event_properties as Record<string, unknown>;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(100_000);
    sessionStorage.clear();
    localStorage.clear();
    history.replaceState({}, '', '/a');
    jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    Object.defineProperty(document, 'referrer', { value: 'https://www.google.com/', configurable: true });
    client = new AmplitudeBrowser();
  });

  afterEach(async () => {
    await client.remove('@amplitude/plugin-engaged-time-tracking-browser').promise;
    await client.remove('@amplitude/plugin-page-view-tracking-browser').promise;
    await client.remove('@amplitude/plugin-page-url-enrichment-browser').promise;
    await client.flush().promise;
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    jest.useRealTimers();
  });

  test('uploads clean page snapshots even after enrichment and keeps identify separate', async () => {
    const send = jest.fn<ReturnType<Transport['send']>, Parameters<Transport['send']>>().mockResolvedValue({
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
    await client.init('test-key', {
      autocapture: {
        attribution: false,
        sessions: false,
        fileDownloads: false,
        formInteractions: false,
        pageViews: true,
        engagedTimeTracking: true,
      },
      fetchRemoteConfig: false,
      enableDiagnostics: false,
      identityStorage: 'none',
      offline: false,
      flushIntervalMillis: 10,
      logLevel: 0,
    }).promise;
    await client.add({
      name: 'late-user-properties',
      type: 'enrichment',
      async execute(event) {
        if (event.event_type === '[Amplitude] Page Viewed') event.user_properties = { $set: { plan: 'old' } };
        return event;
      },
    }).promise;
    await jest.advanceTimersByTimeAsync(20);
    client.track({ event_type: '$identify', user_properties: { $set: { plan: 'new' } } });
    await jest.advanceTimersByTimeAsync(15_000);
    await client.remove('@amplitude/plugin-engaged-time-tracking-browser').promise;
    await client.remove('@amplitude/plugin-page-view-tracking-browser').promise;
    await jest.advanceTimersByTimeAsync(20);
    const events = send.mock.calls.flatMap(([, payload]) => {
      const delayed = payload as Payload & { instant_events?: Payload['events'] };
      return [...payload.events, ...(delayed.instant_events || [])];
    });
    const pages = events.filter((event) => event.event_type === '[Amplitude] Page Viewed');
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages.every((event) => !Object.prototype.hasOwnProperty.call(event, 'user_properties'))).toBe(true);
    expect(events.filter((event) => event.event_type === '$identify')).toEqual([
      expect.objectContaining({ user_properties: { $set: { plan: 'new' } } }),
    ]);
  });

  test.each([false, true])(
    'enriches attribution page views after conversion, engagement=%s',
    async (engagedTimeTracking) => {
      const send = jest.fn<ReturnType<Transport['send']>, Parameters<Transport['send']>>().mockResolvedValue({
        status: Status.Success,
        statusCode: 200,
        body: { eventsIngested: 1, payloadSizeBytes: 0, serverUploadTime: 100_000 },
      });
      await client.add({
        name: 'test-transport',
        type: 'before',
        async setup(config) {
          config.transportProvider = { send };
        },
      }).promise;
      await client.init('test-key', {
        autocapture: {
          attribution: false,
          sessions: false,
          fileDownloads: false,
          formInteractions: false,
          pageViews: { trackOn: 'attribution' },
          engagedTimeTracking,
        },
        fetchRemoteConfig: false,
        enableDiagnostics: false,
        identityStorage: 'none',
        offline: false,
        flushIntervalMillis: 10,
        logLevel: 0,
      }).promise;
      client.track({ event_type: '$identify', user_properties: { $set: { ...BASE_CAMPAIGN, utm_source: 'test' } } });
      await jest.advanceTimersByTimeAsync(20);
      const events = send.mock.calls.flatMap(([, payload]) => [
        ...payload.events,
        ...((payload as Payload & { instant_events?: Payload['events'] }).instant_events || []),
      ]);
      expect(events).toHaveLength(1);
      const names = client.timeline.plugins.map((plugin) => plugin.name);
      const expectedOrder = [
        '@amplitude/plugin-page-view-tracking-browser',
        '@amplitude/plugin-page-url-enrichment-browser',
        ...(engagedTimeTracking ? ['@amplitude/plugin-engaged-time-tracking-browser'] : []),
      ];
      expect(names.filter((name) => expectedOrder.includes(name || ''))).toEqual(expectedOrder);
      expect(names.includes('@amplitude/plugin-engaged-time-tracking-browser')).toBe(engagedTimeTracking);
      expect(events[0]).toMatchObject({
        event_type: '[Amplitude] Page Viewed',
        event_properties: {
          '[Amplitude] Previous Page Location': 'https://www.google.com/',
          '[Amplitude] Previous Page Type': 'external',
          '[Amplitude] Page Counter': 1,
        },
      });
    },
  );

  test('converts a real campaign identify into one engaged attribution PageView', async () => {
    history.replaceState({}, '', '/article?utm_source=newsletter&utm_medium=email&utm_campaign=launch');
    const send = jest.fn<ReturnType<Transport['send']>, Parameters<Transport['send']>>().mockResolvedValue({
      status: Status.Success,
      statusCode: 200,
      body: { eventsIngested: 1, payloadSizeBytes: 0, serverUploadTime: 100_000 },
    });
    await client.add({
      name: 'test-transport',
      type: 'before',
      async setup(config) {
        config.transportProvider = { send };
      },
    }).promise;
    await client.init('test-key', {
      autocapture: {
        attribution: { trackingMethod: 'userProperty' },
        sessions: false,
        fileDownloads: false,
        formInteractions: false,
        pageViews: { trackOn: 'attribution' },
        engagedTimeTracking: true,
      },
      fetchRemoteConfig: false,
      enableDiagnostics: false,
      identityStorage: 'none',
      offline: false,
      flushIntervalMillis: 10,
      logLevel: 0,
    }).promise;
    await jest.advanceTimersByTimeAsync(20);
    const events = () =>
      send.mock.calls.flatMap(([, payload]) => [
        ...payload.events,
        ...((payload as Payload & { instant_events?: Payload['events'] }).instant_events || []),
      ]);
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({
      event_type: '[Amplitude] Page Viewed',
      event_properties: {
        utm_source: 'newsletter',
        '[Amplitude] Page Counter': 1,
        '[Amplitude] Engaged Time': expect.any(Number),
        '[Amplitude] Previous Page Location': 'https://www.google.com/',
      },
    });
    client.track({ event_type: '$identify', user_properties: { $set: { plan: 'pro' } } });
    await jest.advanceTimersByTimeAsync(20);
    expect(events().filter((event) => event.event_type === '$identify')).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(15_000);
    const pages = events().filter((event) => event.event_type === '[Amplitude] Page Viewed');
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((event) => properties(event)['[Amplitude] Page Counter'] === 1)).toBe(true);
  });

  test.each([false, true])('preserves navigation sources with engagedTimeTracking=%s', async (engagedTimeTracking) => {
    const send = jest.fn<ReturnType<Transport['send']>, Parameters<Transport['send']>>().mockResolvedValue({
      status: Status.Success,
      statusCode: 200,
      body: { eventsIngested: 1, payloadSizeBytes: 0, serverUploadTime: 100_000 },
    });
    await client.add({
      name: 'test-transport',
      type: 'before',
      async setup(config) {
        config.transportProvider = { send };
      },
    }).promise;
    await client.init('test-key', {
      autocapture: {
        attribution: false,
        sessions: false,
        fileDownloads: false,
        formInteractions: false,
        pageViews: { trackHistoryChanges: 'all' },
        engagedTimeTracking: engagedTimeTracking,
        // Leave pageUrlEnrichment at its default to exercise the standard setup.
      },
      fetchRemoteConfig: false,
      enableDiagnostics: false,
      identityStorage: 'none',
      offline: false,
      flushIntervalMillis: 10,
      logLevel: 0,
    }).promise;
    await jest.advanceTimersByTimeAsync(20);
    const events = () =>
      send.mock.calls.flatMap(([, payload]) => {
        const delayed = payload as Payload & { instant_events?: Payload['events'] };
        return [...payload.events, ...(delayed.instant_events || [])];
      });
    expect(events()).toHaveLength(1);
    expect(events()[0].event_properties).toMatchObject({
      '[Amplitude] Page Location': `${location.origin}/a`,
      '[Amplitude] Previous Page Location': 'https://www.google.com/',
      '[Amplitude] Previous Page Type': 'external',
    });
    await jest.advanceTimersByTimeAsync(15_000);
    history.pushState({}, '', '/b');
    await jest.advanceTimersByTimeAsync(20);
    const pageA = events().filter((event) => properties(event)['[Amplitude] Page Location'] === `${location.origin}/a`);
    const pageB = events().filter((event) => properties(event)['[Amplitude] Page Location'] === `${location.origin}/b`);
    expect(pageA).toHaveLength(engagedTimeTracking ? 3 : 1);
    expect(pageA.map((event) => properties(event)['[Amplitude] Previous Page Location'])).toEqual(
      Array(engagedTimeTracking ? 3 : 1).fill('https://www.google.com/'),
    );
    expect(pageA.map((event) => properties(event)['[Amplitude] Previous Page Type'])).toEqual(
      Array(engagedTimeTracking ? 3 : 1).fill('external'),
    );
    expect(pageB).toHaveLength(1);
    expect(pageB[0].event_properties).toMatchObject({
      '[Amplitude] Previous Page Location': `${location.origin}/a`,
      '[Amplitude] Previous Page Type': 'internal',
    });
    expect(properties(pageA[pageA.length - 1])['[Amplitude] Engagement Snapshot Reason']).toBe(
      engagedTimeTracking ? 'navigation' : undefined,
    );
  });
});
