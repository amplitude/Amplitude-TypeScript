import {
  BrowserClient,
  BrowserConfig,
  BaseEvent as AnalyticsEvent,
  getHeartbeatInstance,
  Logger,
  EngagedTimeOptions,
} from '@amplitude/analytics-core';
import { PageEngagement } from '../src/page-engagement';

describe('page engagement', () => {
  let owner: PageEngagement;
  let client: jest.Mocked<BrowserClient>;
  let sent: AnalyticsEvent[];
  let newView: jest.Mock;
  const original: AnalyticsEvent = {
    event_type: '[Amplitude] Page Viewed',
    insert_id: 'original-id',
    time: 100_000,
    user_id: 'original-user',
    session_id: 123,
    event_properties: { '[Amplitude] Page View ID': 'view-one', '[Amplitude] Page Counter': 1 },
  };
  const latest = () => sent[sent.length - 1];
  const engaged = () => latest().event_properties!['[Amplitude] Engaged Time'] as number;
  const start = async (options: EngagedTimeOptions = {}) => {
    const config = { loggerProvider: new Logger(), optOut: false } as unknown as BrowserConfig;
    owner = new PageEngagement(client, window, options, config, newView);
    owner.start(original);
    await jest.advanceTimersByTimeAsync(0);
  };
  const visibility = (value: DocumentVisibilityState) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(100_000);
    jest.spyOn(document, 'hasFocus').mockReturnValue(true);
    visibility('visible');
    sent = [];
    newView = jest.fn();
    client = {
      track: jest.fn((event_type, event_properties, options) => {
        const event = { event_type, event_properties, ...options } as AnalyticsEvent;
        sent.push(event);
        return { promise: Promise.resolve({ event, code: 200, message: 'success' }) };
      }),
      flush: jest.fn(),
    } as unknown as jest.Mocked<BrowserClient>;
  });

  afterEach(() => {
    owner?.teardown();
    jest.useRealTimers();
  });

  test('caps idle engagement at five seconds, sends cumulative snapshots every 15 seconds and finalizes at three minutes', async () => {
    await start();
    const delay = latest().delay;
    expect(delay).toEqual({ id: expect.any(String), timeout: 180_000 });
    await jest.advanceTimersByTimeAsync(15_000);
    expect(sent).toHaveLength(2);
    expect(engaged()).toBe(5_000);
    await jest.advanceTimersByTimeAsync(165_000);
    expect(latest().delay).toEqual({ id: delay!.id });
    expect(engaged()).toBe(5_000);
    expect(latest().event_properties!['[Amplitude] Engagement Snapshot Reason']).toBe('inactivity');
    expect(sent.every((event) => event.time === original.time && event.insert_id === original.insert_id)).toBe(true);
    const count = sent.length;
    await jest.advanceTimersByTimeAsync(30_000);
    expect(sent).toHaveLength(count);
    document.dispatchEvent(new Event('pointerdown'));
    expect(newView).toHaveBeenCalledTimes(1);
  });

  test('unions rolling windows without counting idle gaps or extending deadlines on heartbeats', async () => {
    await start();
    await jest.advanceTimersByTimeAsync(4_000);
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(6_000);
    document.dispatchEvent(new Event('scroll'));
    await jest.advanceTimersByTimeAsync(5_000);
    expect(engaged()).toBe(14_000);
    expect(latest()).toMatchObject({
      user_id: 'original-user',
      session_id: 123,
      event_properties: original.event_properties,
    });
    await jest.advanceTimersByTimeAsync(175_000);
    expect(latest().delay!.timeout).toBeUndefined();
  });

  test('pauses on blur and hidden, then resumes the same page before timeout', async () => {
    await start();
    const id = latest().delay!.id;
    await jest.advanceTimersByTimeAsync(2_000);
    window.dispatchEvent(new Event('blur'));
    expect(engaged()).toBe(2_000);
    await jest.advanceTimersByTimeAsync(28_000);
    document.dispatchEvent(new Event('pointermove'));
    expect(engaged()).toBe(2_000);
    window.dispatchEvent(new Event('focus'));
    await jest.advanceTimersByTimeAsync(2_000);
    visibility('hidden');
    expect(engaged()).toBe(4_000);
    window.dispatchEvent(new Event('focus'));
    await jest.advanceTimersByTimeAsync(28_000);
    expect(engaged()).toBe(4_000);
    visibility('visible');
    await jest.advanceTimersByTimeAsync(15_000);
    expect(engaged()).toBe(9_000);
    expect(latest().delay!.id).toBe(id);
    expect(newView).not.toHaveBeenCalled();
  });

  test.each(['blur', 'pagehide'])('flushes on %s before the snapshot response resolves', async (type) => {
    await start();
    client.flush.mockClear();
    let complete: () => void = () => undefined;
    client.track.mockImplementationOnce((event_type, event_properties, options) => {
      const event = { event_type, event_properties, ...options } as AnalyticsEvent;
      return {
        promise: new Promise((resolve) => {
          complete = () => resolve({ event, code: 200, message: 'success' });
        }),
      };
    });
    window.dispatchEvent(type === 'pagehide' ? new PageTransitionEvent(type) : new Event(type));
    expect(client.track.mock.calls).toHaveLength(2);
    expect(client.flush.mock.calls).toHaveLength(1);
    expect(client.flush.mock.invocationCallOrder[0]).toBeGreaterThan(client.track.mock.invocationCallOrder[1]);
    complete();
    await jest.advanceTimersByTimeAsync(0);
  });

  test('handles BFCache suspension and return after expiry without reviving the old view', async () => {
    await start();
    await jest.advanceTimersByTimeAsync(1_000);
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    expect(engaged()).toBe(1_000);
    jest.setSystemTime(400_000);
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(latest().delay!.timeout).toBeUndefined();
    expect(engaged()).toBe(1_000);
    expect(newView).toHaveBeenCalledTimes(1);
  });

  test('an overdue heartbeat finalizes rather than refreshing an expired delay group', async () => {
    await start();
    jest.setSystemTime(400_000);
    await jest.advanceTimersByTimeAsync(15_000);
    expect(latest().delay!.timeout).toBeUndefined();
    expect(engaged()).toBe(5_000);
    const count = sent.length;
    await jest.advanceTimersByTimeAsync(30_000);
    expect(sent).toHaveLength(count);
  });

  test('new page views get independent delay groups; navigation finalizes the previous page', async () => {
    await start();
    const firstId = latest().delay!.id;
    await jest.advanceTimersByTimeAsync(3_000);
    owner.start({ ...original, insert_id: 'second-id', time: 103_000 });
    expect(engaged()).toBe(3_000);
    expect(latest().delay).toEqual({ id: firstId });
    await jest.advanceTimersByTimeAsync(1);
    expect(latest().insert_id).toBe('second-id');
    expect(latest().delay!.id).not.toBe(firstId);
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    expect(latest().delay!.timeout).toBeUndefined();
    expect(client.flush.mock.calls.length).toBeGreaterThan(0);
  });

  test('opt-out discards local state and listeners are removed on teardown', async () => {
    await start();
    const count = sent.length;
    owner.setOptOut(true);
    owner.start(original);
    document.dispatchEvent(new Event('keydown'));
    await jest.advanceTimersByTimeAsync(200_000);
    expect(sent).toHaveLength(count);
    expect(newView).not.toHaveBeenCalled();
    owner.setOptOut(false);
    document.dispatchEvent(new Event('keydown'));
    expect(newView).toHaveBeenCalledTimes(1);
    owner.teardown();
    document.dispatchEvent(new Event('keydown'));
    expect(newView).toHaveBeenCalledTimes(1);
  });

  test('accepts custom timings and caps an unsafe heartbeat cadence below the timeout', async () => {
    await start({ engagementThresholdMillis: 1_000, heartbeatIntervalMillis: 20_000, pageSessionTimeoutMillis: 8_000 });
    await jest.advanceTimersByTimeAsync(4_000);
    expect(sent).toHaveLength(2);
    expect(engaged()).toBe(1_000);
    expect(latest().delay!.timeout).toBe(8_000);
    await jest.advanceTimersByTimeAsync(4_000);
    expect(latest().delay!.timeout).toBeUndefined();
  });

  test.each([NaN, Infinity, 0, -1, 2_147_483_648])('uses defaults for invalid timing %s', async (value) => {
    await start({ engagementThresholdMillis: value, heartbeatIntervalMillis: value, pageSessionTimeoutMillis: value });
    await jest.advanceTimersByTimeAsync(15_000);
    expect(sent).toHaveLength(2);
    expect(engaged()).toBe(5_000);
    expect(latest().delay!.timeout).toBe(180_000);
  });

  test('background initial load accrues no time and fills missing event IDs', async () => {
    visibility('hidden');
    await start();
    owner.start({ event_type: '[Amplitude] Page Viewed' });
    await jest.advanceTimersByTimeAsync(15_000);
    expect(engaged()).toBe(0);
    expect(latest()).toMatchObject({ insert_id: expect.any(String), time: 100_000 });
    window.dispatchEvent(new PageTransitionEvent('pageshow'));
    expect(newView).not.toHaveBeenCalled();
  });

  test('does not alter the video heartbeat queue, 60-second pulse, or one-hour delay', async () => {
    const video = getHeartbeatInstance(client);
    void video.track({ event_type: 'video', insert_id: 'video-id' });
    await start();
    await jest.advanceTimersByTimeAsync(60_000);
    const videoEvents = sent.filter((event) => event.event_type === 'video');
    expect(videoEvents).toHaveLength(2);
    expect(videoEvents[0].delay!.timeout).toBe(3_600_000);
    expect(videoEvents[0].delay!.id).not.toBe(latest().delay!.id);
    owner.teardown();
    const count = sent.filter((event) => event.event_type === 'video').length;
    await jest.advanceTimersByTimeAsync(60_000);
    expect(sent.filter((event) => event.event_type === 'video')).toHaveLength(count + 1);
    video.stop();
  });
});
