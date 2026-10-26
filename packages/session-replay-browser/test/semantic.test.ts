import { createSemanticCapture, SemanticHost } from '@amplitude/amp-semantic';
import { eventWithTime, EventType, IncrementalSource } from '@amplitude/rrweb-types';
import { ReplaySemanticAdapter } from '../src/semantic';
import { subscribeToUrlChanges } from '../src/plugins/url-tracking-plugin';

jest.mock('@amplitude/amp-semantic', () => ({ createSemanticCapture: jest.fn() }));
jest.mock('../src/plugins/url-tracking-plugin', () => ({ subscribeToUrlChanges: jest.fn() }));

describe('ReplaySemanticAdapter', () => {
  const capture = {
    isActive: jest.fn(() => true),
    start: jest.fn(),
    stop: jest.fn(),
    updateConfig: jest.fn(),
    resetSession: jest.fn(),
    notify: jest.fn(),
  };
  const host: SemanticHost = {
    document,
    window,
    emit: jest.fn(),
    getNodeId: () => -1,
    getPrivacy: () => ({}),
    getUrl: () => location.href,
    sdk: 'test',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    capture.isActive.mockReturnValue(true);
    jest.mocked(createSemanticCapture).mockReturnValue(capture);
  });

  const snapshot = {
    type: EventType.FullSnapshot,
    timestamp: 1,
    data: { node: { type: 0, id: 1, childNodes: [] }, initialOffset: { top: 0, left: 0 } },
  } as Extract<eventWithTime, { type: EventType.FullSnapshot }>;
  const mutation = {
    type: EventType.IncrementalSnapshot,
    timestamp: 2,
    data: {
      source: IncrementalSource.Mutation,
      adds: [],
      removes: [],
      attributes: [],
      texts: [{ id: 2, value: 'Updated' }],
    },
  } as Extract<eventWithTime, { type: EventType.IncrementalSnapshot }>;

  test('forwards accepted DOM input in order after startup and ignores semantic custom events', () => {
    const adapter = new ReplaySemanticAdapter(host);
    adapter.prepare({ enabled: true }, 1);
    adapter.event(snapshot);
    adapter.event(mutation);
    expect(capture.notify).not.toHaveBeenCalled();
    adapter.recordingReady();
    expect(capture.notify.mock.calls).toEqual([
      ['dom', { type: 'snapshot', node: (snapshot.data as { node: unknown }).node }],
      ['recording', { state: 'start', reason: 'init' }],
      ['snapshot', undefined],
      ['dom', { ...mutation.data, type: 'mutation' }],
    ]);
    capture.notify.mockClear();
    adapter.event({ type: EventType.Custom, timestamp: 3, data: { tag: 'amp-semantic/notice', payload: {} } });
    expect(capture.notify).not.toHaveBeenCalled();
    adapter.event(mutation);
    expect(capture.notify).toHaveBeenCalledTimes(1);
  });

  test('drops startup DOM input on stop/reprepare, disable, and sample-out', () => {
    const adapter = new ReplaySemanticAdapter(host);
    adapter.prepare({ enabled: true }, 1);
    adapter.event(snapshot);
    adapter.stop();
    adapter.prepare({ enabled: true }, 2);
    adapter.recordingReady();
    expect(capture.notify).not.toHaveBeenCalled();
    capture.isActive.mockReturnValue(false);
    adapter.event(mutation);
    expect(capture.notify).not.toHaveBeenCalled();
    adapter.stop();
    adapter.prepare({ enabled: false }, 2);
    adapter.event(snapshot);
    adapter.recordingReady();
    expect(capture.notify).not.toHaveBeenCalled();
  });

  test('forwards native clicks only while the recorder is ready', () => {
    const adapter = new ReplaySemanticAdapter(host);
    const event = new MouseEvent('click', { ctrlKey: true });
    adapter.prepare({ enabled: true }, 1);
    adapter.click(event);
    expect(capture.notify).not.toHaveBeenCalled();
    adapter.recordingReady();
    capture.notify.mockClear();
    adapter.click(event);
    expect(capture.notify).toHaveBeenCalledWith('click', event);
    adapter.stop();
    capture.notify.mockClear();
    adapter.click(event);
    expect(capture.notify).not.toHaveBeenCalled();
  });

  test('defers initial signals until rrweb returns and emits one context per snapshot', () => {
    const adapter = new ReplaySemanticAdapter(host);
    adapter.prepare({ enabled: true }, 1);
    adapter.snapshot();
    expect(capture.notify).not.toHaveBeenCalled();
    adapter.recordingReady();
    expect(capture.start).toHaveBeenCalledTimes(1);
    expect(capture.notify.mock.calls).toEqual([
      ['recording', { state: 'start', reason: 'init' }],
      ['snapshot', undefined],
    ]);
    adapter.snapshot();
    expect(capture.notify.mock.calls.filter(([signal]) => signal === 'snapshot')).toHaveLength(2);
    adapter.stop('customer_stop');
    expect(capture.notify).toHaveBeenLastCalledWith('recording', { state: 'stop', reason: 'customer_stop' });
    adapter.stop();
    expect(capture.notify).toHaveBeenCalledTimes(4);
  });

  test('preserves the sampling and cap session across resume; resets for a new session', () => {
    const adapter = new ReplaySemanticAdapter(host);
    adapter.prepare({ enabled: true }, 1);
    adapter.recordingReady();
    adapter.snapshot();
    adapter.stop('focus', 'pause');
    adapter.prepare({ enabled: true }, 1);
    adapter.recordingReady();
    adapter.snapshot();
    expect(capture.resetSession).toHaveBeenCalledTimes(1);
    expect(capture.notify).toHaveBeenCalledWith('recording', { state: 'resume', reason: 'focus' });
    adapter.stop('new_session');
    adapter.prepare({ enabled: true }, 2);
    adapter.recordingReady();
    adapter.snapshot();
    expect(capture.resetSession).toHaveBeenCalledTimes(2);
    expect(capture.notify).toHaveBeenCalledWith('recording', { state: 'start', reason: 'new_session' });
  });

  test('disabled configuration does not start capture or attach URL subscriptions', () => {
    const adapter = new ReplaySemanticAdapter(host);
    adapter.prepare({ enabled: false }, 1);
    adapter.snapshot();
    adapter.recordingReady();
    expect(capture.start).not.toHaveBeenCalled();
    expect(capture.notify).not.toHaveBeenCalled();
    expect(subscribeToUrlChanges).not.toHaveBeenCalled();
  });

  test('sampled-out capture does not attach a navigation subscription', () => {
    capture.isActive.mockReturnValue(false);
    const adapter = new ReplaySemanticAdapter(host);
    adapter.prepare({ enabled: true, sampleRate: 0.1 }, 1);
    adapter.recordingReady();
    expect(capture.start).toHaveBeenCalledTimes(1);
    expect(subscribeToUrlChanges).not.toHaveBeenCalled();
  });

  test('forwards initial and later URL-plugin observations without a second subscription', () => {
    const adapter = new ReplaySemanticAdapter(host);
    const urlEvent = {
      type: EventType.Plugin,
      timestamp: 100,
      data: {
        plugin: 'amplitude/url-tracking@1',
        payload: { type: 'url-change-event', href: '/accounts/8812?private=hidden' },
      },
    } as eventWithTime;
    adapter.prepare({ enabled: true }, 1);
    adapter.event(urlEvent);
    expect(capture.notify).not.toHaveBeenCalled();
    adapter.recordingReady();
    expect(capture.notify).toHaveBeenCalledWith('url', { url: '/accounts/8812?private=hidden', timestamp: 100 });
    expect(subscribeToUrlChanges).not.toHaveBeenCalled();
    capture.notify.mockClear();
    adapter.event({ ...urlEvent, timestamp: 200 });
    expect(capture.notify).toHaveBeenCalledWith('url', { url: '/accounts/8812?private=hidden', timestamp: 200 });
  });

  test('ignores malformed/unrelated plugins and drops buffered URLs on stop', () => {
    const adapter = new ReplaySemanticAdapter(host);
    adapter.prepare({ enabled: true }, 1);
    for (const payload of [null, 'bad', { href: 123, type: 'url-change-event' }, { href: '/wrong-type' }]) {
      adapter.event({ type: EventType.Plugin, timestamp: 1, data: { plugin: 'amplitude/url-tracking@1', payload } });
    }
    adapter.event({
      type: EventType.Plugin,
      timestamp: 1,
      data: { plugin: 'other', payload: { type: 'url-change-event', href: '/ignore' } },
    });
    adapter.recordingReady();
    expect(capture.notify).not.toHaveBeenCalled();
    adapter.stop();
    adapter.prepare({ enabled: true }, 2);
    adapter.event({
      type: EventType.Plugin,
      timestamp: 2,
      data: { plugin: 'amplitude/url-tracking@1', payload: { type: 'url-change-event', href: '/stale' } },
    });
    adapter.stop();
    adapter.prepare({ enabled: true }, 3);
    adapter.recordingReady();
    expect(capture.notify).not.toHaveBeenCalled();
  });
});
