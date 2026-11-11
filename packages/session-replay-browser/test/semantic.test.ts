import type { SemanticCaptureFactory, SemanticCaptureHost } from '../src/semantic-types';
import { eventWithTime, EventType } from '@amplitude/rrweb-types';
import { ReplaySemanticAdapter, MAX_PENDING_SEMANTIC_SNAPSHOTS } from '../src/semantic';

describe('ReplaySemanticAdapter', () => {
  const capture = {
    isActive: jest.fn(() => true),
    start: jest.fn(),
    stop: jest.fn(),
    updateConfig: jest.fn(),
    resetSession: jest.fn(),
    notify: jest.fn(),
  };
  const createSemanticCapture = jest.fn<ReturnType<SemanticCaptureFactory>, Parameters<SemanticCaptureFactory>>();
  const host: SemanticCaptureHost = { document, window, sdk: 'test', emit: jest.fn(), getPrivacy: () => ({}) };
  const snapshot = { type: EventType.FullSnapshot, timestamp: 1 } as eventWithTime;
  beforeEach(() => {
    jest.clearAllMocks();
    capture.isActive.mockReturnValue(true);
    jest.mocked(createSemanticCapture).mockReturnValue(capture);
  });

  test('waits for rrweb readiness, then forwards each snapshot once without custom-event recursion', () => {
    const adapter = new ReplaySemanticAdapter(createSemanticCapture, host);
    adapter.prepare({ enabled: true }, 1);
    adapter.event(snapshot);
    expect(capture.notify).not.toHaveBeenCalled();
    adapter.recordingReady();
    adapter.recordingReady();
    expect(capture.start).toHaveBeenCalledTimes(1);
    expect(capture.notify).toHaveBeenCalledWith('recording', { state: 'start', reason: 'init' });
    expect(capture.notify).toHaveBeenCalledWith('snapshot', undefined);
    adapter.event({ type: EventType.Custom, timestamp: 2, data: { tag: 'amp-semantic/context', payload: {} } });
    expect(capture.notify).toHaveBeenCalledTimes(2);
    adapter.event(snapshot);
    expect(capture.notify).toHaveBeenCalledTimes(3);
  });

  test('clears queued snapshots on stop and prepare; preserves session sampling until the session changes', () => {
    const adapter = new ReplaySemanticAdapter(createSemanticCapture, host);
    adapter.prepare({ enabled: true }, 1);
    adapter.event(snapshot);
    adapter.stop();
    adapter.recordingReady();
    expect(capture.notify).not.toHaveBeenCalled();
    adapter.prepare({ enabled: true }, 1);
    adapter.event(snapshot);
    adapter.prepare({ enabled: true }, 2);
    adapter.recordingReady();
    expect(capture.notify).not.toHaveBeenCalled();
    expect(capture.resetSession).toHaveBeenCalledTimes(2);
    expect(capture.stop).toHaveBeenCalled();
  });

  test('does not deliver snapshots when disabled or sampled out', () => {
    const adapter = new ReplaySemanticAdapter(createSemanticCapture, host);
    adapter.prepare({ enabled: false }, 1);
    adapter.event(snapshot);
    adapter.recordingReady();
    expect(capture.start).not.toHaveBeenCalled();
    capture.isActive.mockReturnValue(false);
    adapter.prepare({ enabled: true, sampleRate: 0.01 }, 1);
    adapter.event(snapshot);
    adapter.recordingReady();
    adapter.event(snapshot);
    expect(capture.notify).not.toHaveBeenCalled();
  });

  test('bounds deferred startup work without retaining DOM snapshots', () => {
    const adapter = new ReplaySemanticAdapter(createSemanticCapture, host);
    adapter.prepare({ enabled: true }, 1);
    for (let i = 0; i < 1000; i++) adapter.event(snapshot);
    adapter.recordingReady();
    expect(capture.notify).toHaveBeenCalledTimes(MAX_PENDING_SEMANTIC_SNAPSHOTS + 1);
  });

  test('forwards accepted URL plugin events in order and ignores other plugin payloads', () => {
    const adapter = new ReplaySemanticAdapter(createSemanticCapture, host);
    adapter.prepare({ enabled: true }, 1);
    const plugin = (href: string, timestamp: number) =>
      ({
        type: EventType.Plugin,
        timestamp,
        data: { plugin: 'amplitude/url-tracking@1', payload: { type: 'url-change-event', href } },
      } as eventWithTime);
    adapter.event(plugin('https://example.com/first', 7));
    adapter.event(snapshot);
    adapter.recordingReady();
    expect(capture.notify.mock.calls).toEqual([
      ['url', { url: 'https://example.com/first', timestamp: 7 }],
      ['recording', { state: 'start', reason: 'init' }],
      ['snapshot', undefined],
    ]);
    adapter.event(plugin('https://example.com/second', 8));
    adapter.event({ type: EventType.Plugin, timestamp: 9, data: { plugin: 'other', payload: {} } });
    adapter.event({
      type: EventType.Plugin,
      timestamp: 10,
      data: { plugin: 'amplitude/url-tracking@1', payload: { type: 'url-change-event', href: 4 } },
    });
    adapter.event({
      type: EventType.Plugin,
      timestamp: 11,
      data: { plugin: 'amplitude/url-tracking@1', payload: null },
    });
    expect(capture.notify).toHaveBeenLastCalledWith('url', { url: 'https://example.com/second', timestamp: 8 });
    expect(capture.notify).toHaveBeenCalledTimes(4);
    adapter.prepare({ enabled: false }, 1);
    adapter.event(plugin('https://example.com/disabled', 12));
    expect(capture.notify).toHaveBeenLastCalledWith('recording', { state: 'stop', reason: 'targeting' });
    expect(capture.notify).toHaveBeenCalledTimes(5);
  });

  test('emits stop before teardown and resumes the same session after a new snapshot', () => {
    const adapter = new ReplaySemanticAdapter(createSemanticCapture, host);
    adapter.prepare({ enabled: true }, 1);
    adapter.event(snapshot);
    adapter.recordingReady();
    adapter.stop('customer_stop');
    expect(capture.notify).toHaveBeenLastCalledWith('recording', { state: 'stop', reason: 'customer_stop' });
    expect(capture.stop).toHaveBeenCalledTimes(2); // prepare and explicit stop
    adapter.prepare({ enabled: true }, 1);
    adapter.event(snapshot);
    adapter.recordingReady();
    expect(capture.notify).toHaveBeenLastCalledWith('snapshot', undefined);
    expect(capture.notify).toHaveBeenCalledWith('recording', { state: 'resume', reason: 'customer_stop' });
    adapter.stop('new_session');
    adapter.prepare({ enabled: true }, 2);
    adapter.event(snapshot);
    adapter.recordingReady();
    expect(capture.notify).toHaveBeenCalledWith('recording', { state: 'start', reason: 'new_session' });
  });
});
