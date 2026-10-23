import { Event as AnalyticsEvent, Payload, Status, Transport } from '@amplitude/analytics-core';
import { AmplitudeBrowser } from '../src/browser-client';

describe('engaged page lifecycle boundaries through the Browser SDK', () => {
  let client: AmplitudeBrowser;
  let send: jest.Mock<ReturnType<Transport['send']>, Parameters<Transport['send']>>;
  const originalPushState = history.pushState.bind(history);
  const properties = (event: AnalyticsEvent) => event.event_properties as Record<string, unknown>;
  const events = () =>
    send.mock.calls.flatMap(([, payload]) => {
      const delayed = payload as Payload & { instant_events?: Payload['events'] };
      return [...payload.events, ...(delayed.instant_events || [])];
    });
  const init = async (userId: string | undefined) => {
    await client.init('test-key', userId, {
      autocapture: {
        attribution: false,
        sessions: false,
        fileDownloads: false,
        formInteractions: false,
        pageViews: { trackEngagedTime: true },
        pageUrlEnrichment: false,
      },
      fetchRemoteConfig: false,
      enableDiagnostics: false,
      identityStorage: 'none',
      offline: false,
      flushIntervalMillis: 10,
      logLevel: 0,
    }).promise;
    await jest.advanceTimersByTimeAsync(20);
  };
  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(100_000);
    sessionStorage.clear();
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
    await client.remove('@amplitude/plugin-page-view-tracking-browser').promise;
    await jest.advanceTimersByTimeAsync(20);
    await client.flush().promise;
    history.pushState = originalPushState;
    jest.useRealTimers();
  });

  test.each(['user', 'device', 'reset', 'session', 'consent'] as const)(
    'cancels a pending page view at the %s boundary and allows a fresh view',
    async (boundary) => {
      let release!: () => void;
      let held = false;
      await client.add({
        name: 'hold-original',
        type: 'enrichment',
        async execute(event) {
          if (!held && event.event_type === '[Amplitude] Page Viewed' && !event.delay) {
            held = true;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
          return event;
        },
      }).promise;
      await init('old-user');
      expect(held).toBe(true);
      expect(send).not.toHaveBeenCalled();
      if (boundary === 'user') client.setUserId('new-user');
      if (boundary === 'device') client.setDeviceId('new-device');
      if (boundary === 'reset') client.reset();
      if (boundary === 'session') client.setSessionId(200_000);
      if (boundary === 'consent') {
        client.setOptOut(true);
        client.setOptOut(false);
      }
      release();
      await jest.advanceTimersByTimeAsync(100);
      expect(send).not.toHaveBeenCalled();
      document.dispatchEvent(new Event('keydown'));
      await jest.advanceTimersByTimeAsync(20);
      expect(events()).toHaveLength(1);
      expect(events()[0]).toMatchObject({
        device_id: client.getDeviceId(),
        user_id: client.getUserId(),
        session_id: client.getSessionId(),
      });
      expect((events()[0].event_properties as Record<string, unknown>)['[Amplitude] Page Counter']).toBe(1);
    },
  );

  test.each([false, true])(
    'keeps a pending page A as an ordinary view after navigating to B (B starts first: %s)',
    async (startBFirst) => {
      history.replaceState({}, '', '/pending-a');
      let release!: () => void;
      let original!: AnalyticsEvent;
      await client.add({
        name: 'hold-page-a',
        type: 'enrichment',
        async execute(event) {
          if (!original && event.event_type === '[Amplitude] Page Viewed' && !event.delay) {
            original = event;
            await new Promise<void>((resolve) => {
              release = resolve;
            });
          }
          return event;
        },
      }).promise;
      await init('old-user');
      const pageViewId = properties(original)['[Amplitude] Page View ID'];
      const time = original.time;
      history.pushState({}, '', '/pending-b');
      await jest.advanceTimersByTimeAsync(20);
      if (startBFirst) {
        await client.flush().promise;
        await jest.advanceTimersByTimeAsync(20);
      }
      release();
      await jest.advanceTimersByTimeAsync(100);
      const pageA = events().filter((event) => properties(event)['[Amplitude] Page Path'] === '/pending-a');
      expect(pageA).toHaveLength(1);
      expect(pageA[0]).toMatchObject({
        time,
        event_properties: { '[Amplitude] Page View ID': pageViewId },
      });
      expect(pageA[0].event_properties).not.toHaveProperty('[Amplitude] Engaged Time');
      expect(pageA[0].event_properties).not.toHaveProperty('[Amplitude] Total Time');
      const ordinarySend = send.mock.calls.find(([, payload]) => payload.events.includes(pageA[0]));
      expect(ordinarySend).toBeDefined();
      expect(ordinarySend![0]).not.toContain('/delayed');
      const pageB = events().find((event) => properties(event)['[Amplitude] Page Path'] === '/pending-b');
      expect(pageB).toBeDefined();
      await jest.advanceTimersByTimeAsync(15_000);
      const latest = events()[events().length - 1];
      expect(latest.event_properties).toMatchObject({
        '[Amplitude] Page Path': '/pending-b',
        '[Amplitude] Page View ID': properties(pageB!)['[Amplitude] Page View ID'],
      });
      expect(properties(latest)['[Amplitude] Engaged Time']).toBeGreaterThan(0);
      expect(events().filter((event) => properties(event)['[Amplitude] Page Path'] === '/pending-a')).toHaveLength(1);
    },
  );

  test.each([false, true])('revokes a waiting snapshot permanently (opt back in: %s)', async (optBackIn) => {
    let release!: () => void;
    let held = false;
    await client.add({
      name: 'hold-snapshot',
      type: 'enrichment',
      async execute(event) {
        if (!held && event.delay) {
          held = true;
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return event;
      },
    }).promise;
    await init('old-user');
    expect(held).toBe(true);
    expect(send).not.toHaveBeenCalled();
    client.setOptOut(true);
    if (optBackIn) client.setOptOut(false);
    release();
    await jest.advanceTimersByTimeAsync(100);
    expect(send).not.toHaveBeenCalled();
    if (optBackIn) {
      document.dispatchEvent(new Event('keydown'));
      await jest.advanceTimersByTimeAsync(20);
    }
    expect(events()).toHaveLength(optBackIn ? 1 : 0);
  });

  test('finalizes each identity segment without rewriting its identity during signup and signout', async () => {
    await init(undefined);
    const original = events()[0];
    await jest.advanceTimersByTimeAsync(1_000);
    client.setUserId('signed-up-user');
    await jest.advanceTimersByTimeAsync(20);
    expect(events()[1]).toMatchObject({ user_id: undefined, insert_id: original.insert_id, time: original.time });
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(20);
    const signedUp = events()[2];
    expect(signedUp.user_id).toBe('signed-up-user');
    expect(signedUp.insert_id).not.toBe(original.insert_id);
    await jest.advanceTimersByTimeAsync(1_000);
    client.reset();
    await jest.advanceTimersByTimeAsync(20);
    const finalSignedUp = events()[3];
    expect(finalSignedUp).toMatchObject({
      user_id: 'signed-up-user',
      device_id: signedUp.device_id,
      insert_id: signedUp.insert_id,
    });
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(20);
    const signedOut = events()[4];
    expect(signedOut.user_id).toBeUndefined();
    expect(signedOut.device_id).not.toBe(signedUp.device_id);
    const total = (event: AnalyticsEvent) =>
      (event.event_properties as Record<string, number>)['[Amplitude] Engaged Time'];
    expect(total(events()[1])).toBeGreaterThan(0);
    expect(total(finalSignedUp)).toBeGreaterThan(0);
    expect(total(signedOut)).toBeLessThan(100);
  });
});
