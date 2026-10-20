import { createSemanticCapture } from '@amplitude/amp-semantic';
import { getGlobalScope } from '@amplitude/analytics-core';
import { SessionReplay } from '../src/session-replay';
import { SessionReplayJoinedConfig } from '../src/config/types';
import { RecordFunction } from '../src/utils/rrweb';

jest.mock('@amplitude/amp-semantic', () => ({ createSemanticCapture: jest.fn() }));
jest.mock('@amplitude/analytics-core', () => ({
  ...jest.requireActual<typeof import('@amplitude/analytics-core')>('@amplitude/analytics-core'),
  getGlobalScope: jest.fn(),
}));
jest.mock('../src/worker', () => ({ compressionScript: '' }), { virtual: true });

describe('Session Replay semantic integration', () => {
  const capture = {
    isActive: jest.fn(() => true),
    start: jest.fn(),
    stop: jest.fn(),
    updateConfig: jest.fn(),
    resetSession: jest.fn(),
    notify: jest.fn(),
  };
  beforeEach(() => {
    jest.clearAllMocks();
    capture.isActive.mockReturnValue(true);
    jest.mocked(getGlobalScope).mockReturnValue(window as unknown as typeof globalThis);
    jest.mocked(createSemanticCapture).mockReturnValue(capture);
  });

  function prepare(enabled: boolean) {
    const sdk = new SessionReplay();
    sdk.config = {
      semanticCapture: { enabled },
      privacyConfig: { defaultMaskLevel: 'conservative' },
    } as SessionReplayJoinedConfig;
    const record = Object.assign(jest.fn(), {
      addCustomEvent: jest.fn(),
      takeFullSnapshot: jest.fn(),
      mirror: { getId: jest.fn(() => 42), getNode: jest.fn() },
    });
    const internal = sdk as unknown as {
      recordFunction: RecordFunction;
      prepareSemanticCapture: (config: SessionReplayJoinedConfig, sessionId: number) => void;
    };
    internal.recordFunction = record;
    internal.prepareSemanticCapture(sdk.config, 1);
    return { sdk, record, internal };
  }

  test('disabled capture never constructs the semantic runtime', () => {
    prepare(false);
    expect(createSemanticCapture).not.toHaveBeenCalled();
  });

  test('disabled capture preserves session-change behavior without an additional recorder stop', async () => {
    const { sdk } = prepare(false);
    sdk.identifiers = { sessionId: 1, deviceId: 'device' } as typeof sdk.identifiers;
    const recordEvents = jest.fn().mockResolvedValue(undefined);
    sdk.recordEvents = recordEvents;
    const stop = jest.spyOn(sdk, 'stopRecordingEvents');
    await sdk.asyncSetSessionId(2);
    expect(stop).not.toHaveBeenCalled();
    expect(recordEvents).toHaveBeenCalled();
  });

  test.each(['stop', 'shutdown'] as const)('disabled capture preserves %s cancellation ordering', (method) => {
    const { sdk } = prepare(false);
    const internal = sdk as unknown as {
      recordingEnabled: boolean;
      teardownEventListeners: (teardown: boolean) => void;
    };
    const teardown = jest.spyOn(internal, 'teardownEventListeners').mockImplementation(() => undefined);
    let enabledDuringCancel: boolean | undefined;
    let teardownBeforeCancel = false;
    const cancel = jest.fn(() => {
      enabledDuringCancel = internal.recordingEnabled;
      teardownBeforeCancel = teardown.mock.calls.some(([value]) => value === true);
    });
    sdk.recordCancelCallback = cancel;
    sdk[method]();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(enabledDuringCancel).toBe(false);
    expect(teardownBeforeCancel).toBe(method === 'shutdown');
  });

  test('uses direct synchronous rrweb emission without debug metadata and gates on active recording', () => {
    const { sdk, record } = prepare(true);
    const host = jest.mocked(createSemanticCapture).mock.calls[0][1];
    const event = { name: 'visibility' as const, timestamp: 123, payload: { v: 1 as const, state: 'hidden' as const } };
    host.emit(event);
    expect(record.addCustomEvent).not.toHaveBeenCalled();
    sdk.recordCancelCallback = jest.fn();
    host.emit(event);
    expect(record.addCustomEvent).toHaveBeenCalledWith('amp-semantic/visibility', { v: 1, state: 'hidden' });
    expect(host.getNodeId(document.body)).toBe(42);
    expect(host.getPrivacy()).toEqual({ defaultMaskLevel: 'conservative' });
  });

  test('turning capture off updates the retained runtime instead of reactivating old configuration', () => {
    const { sdk, internal } = prepare(true);
    sdk.config = { ...sdk.config, semanticCapture: { enabled: false } } as SessionReplayJoinedConfig;
    internal.prepareSemanticCapture(sdk.config, 1);
    expect(capture.stop).toHaveBeenCalled();
    expect(capture.updateConfig).toHaveBeenLastCalledWith({ enabled: false });
  });
});
