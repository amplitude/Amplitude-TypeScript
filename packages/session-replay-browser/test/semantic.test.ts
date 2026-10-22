import { createSemanticCapture, SemanticHost } from '@amplitude/amp-semantic';
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
  const unsubscribe = jest.fn();
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
    jest.mocked(subscribeToUrlChanges).mockReturnValue(unsubscribe);
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
    expect(unsubscribe).toHaveBeenCalledTimes(1);
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

  test('forwards navigation for shared heading invalidation and unsubscribes on stop', () => {
    const adapter = new ReplaySemanticAdapter(host);
    adapter.prepare({ enabled: true }, 1);
    adapter.recordingReady();
    const callback = jest.mocked(subscribeToUrlChanges).mock.calls[0][2]?.onNavigation;
    callback?.('push');
    expect(capture.notify).toHaveBeenCalledWith('navigation', 'push');
    adapter.stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
