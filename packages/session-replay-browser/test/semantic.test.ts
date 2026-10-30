import { createSemanticCapture, SEMANTIC_CAPS, SemanticHost } from '@amplitude/amp-semantic';
import { eventWithTime, EventType } from '@amplitude/rrweb-types';
import { ReplaySemanticAdapter } from '../src/semantic';

jest.mock('@amplitude/amp-semantic', () => ({
  ...jest.requireActual<typeof import('@amplitude/amp-semantic')>('@amplitude/amp-semantic'),
  createSemanticCapture: jest.fn(),
}));

describe('ReplaySemanticAdapter', () => {
  const capture = {
    isActive: jest.fn(() => true),
    start: jest.fn(),
    stop: jest.fn(),
    updateConfig: jest.fn(),
    resetSession: jest.fn(),
    notify: jest.fn(),
  };
  const host: SemanticHost = { document, window, sdk: 'test', emit: jest.fn(), getPrivacy: () => ({}) };
  const snapshot = { type: EventType.FullSnapshot, timestamp: 1 } as eventWithTime;
  beforeEach(() => {
    jest.clearAllMocks();
    capture.isActive.mockReturnValue(true);
    jest.mocked(createSemanticCapture).mockReturnValue(capture);
  });

  test('waits for rrweb readiness, then forwards each snapshot once without custom-event recursion', () => {
    const adapter = new ReplaySemanticAdapter(host);
    adapter.prepare({ enabled: true }, 1);
    adapter.event(snapshot);
    expect(capture.notify).not.toHaveBeenCalled();
    adapter.recordingReady();
    adapter.recordingReady();
    expect(capture.start).toHaveBeenCalledTimes(1);
    expect(capture.notify).toHaveBeenCalledWith('snapshot', undefined);
    adapter.event({ type: EventType.Custom, timestamp: 2, data: { tag: 'amp-semantic/context', payload: {} } });
    expect(capture.notify).toHaveBeenCalledTimes(1);
    adapter.event(snapshot);
    expect(capture.notify).toHaveBeenCalledTimes(2);
  });

  test('clears queued snapshots on stop and prepare; preserves session sampling until the session changes', () => {
    const adapter = new ReplaySemanticAdapter(host);
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
    const adapter = new ReplaySemanticAdapter(host);
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
    const adapter = new ReplaySemanticAdapter(host);
    adapter.prepare({ enabled: true }, 1);
    for (let i = 0; i < 1000; i++) adapter.event(snapshot);
    adapter.recordingReady();
    expect(capture.notify).toHaveBeenCalledTimes(SEMANTIC_CAPS.context);
  });
});
