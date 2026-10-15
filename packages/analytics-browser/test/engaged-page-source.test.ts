import { Event, Payload, Status, Transport } from '@amplitude/analytics-core';
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
    await client.remove('@amplitude/plugin-page-view-tracking-browser').promise;
    await client.remove('@amplitude/plugin-page-url-enrichment-browser').promise;
    await client.flush().promise;
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    jest.useRealTimers();
  });

  test.each([false, true])('preserves navigation sources with trackEngagedTime=%s', async (trackEngagedTime) => {
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
        pageViews: { trackEngagedTime, trackHistoryChanges: 'all' },
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
    expect(pageA).toHaveLength(trackEngagedTime ? 3 : 1);
    expect(pageA.map((event) => properties(event)['[Amplitude] Previous Page Location'])).toEqual(
      Array(trackEngagedTime ? 3 : 1).fill('https://www.google.com/'),
    );
    expect(pageA.map((event) => properties(event)['[Amplitude] Previous Page Type'])).toEqual(
      Array(trackEngagedTime ? 3 : 1).fill('external'),
    );
    expect(pageB).toHaveLength(1);
    expect(pageB[0].event_properties).toMatchObject({
      '[Amplitude] Previous Page Location': `${location.origin}/a`,
      '[Amplitude] Previous Page Type': 'internal',
    });
    expect(properties(pageA[pageA.length - 1])['[Amplitude] Engagement Snapshot Reason']).toBe(
      trackEngagedTime ? 'navigation' : undefined,
    );
  });
});
