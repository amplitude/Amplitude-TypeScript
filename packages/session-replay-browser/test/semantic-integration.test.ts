import { createSemanticCapture } from '@amplitude/amp-semantic';
import { getGlobalScope } from '@amplitude/analytics-core';
import { SessionReplay } from '../src/session-replay';
import { SessionReplayJoinedConfig } from '../src/config/types';
import { RecordFunction } from '../src/utils/rrweb';
import { finder } from '../src/libs/finder';
import { ClickHandler } from '../src/hooks/click';
import { EventType, MouseInteractions } from '@amplitude/rrweb-types';
jest.mock('../src/libs/finder');

jest.mock('@amplitude/amp-semantic', () => ({
  ...jest.requireActual<typeof import('@amplitude/amp-semantic')>('@amplitude/amp-semantic'),
  createSemanticCapture: jest.fn(),
}));
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
    jest.mocked(finder).mockReturnValue('button');
    capture.isActive.mockReturnValue(true);
    jest.mocked(getGlobalScope).mockReturnValue(window as unknown as typeof globalThis);
    jest.mocked(createSemanticCapture).mockReturnValue(capture);
  });

  function prepare(enabled: boolean, supportsNativeMouseInteraction = false) {
    const sdk = new SessionReplay();
    sdk.config = {
      semanticCapture: { enabled },
      privacyConfig: { defaultMaskLevel: 'conservative' },
    } as SessionReplayJoinedConfig;
    const record = Object.assign(jest.fn(), {
      supportsNativeMouseInteraction,
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

  test.each([true, false])('uses native rrweb clicks only when the recorder supports them (%s)', (supported) => {
    prepare(true, supported);
    const host = jest.mocked(createSemanticCapture).mock.calls[0][1];
    expect(host.externalClicks).toBe(supported);
    expect(host.externalAuxClicks).toBe(false);
  });

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
    const event = {
      name: 'visibility' as const,
      timestamp: 123,
      payload: {
        v: 1 as const,
        state: 'hidden' as const,
        tab_id: 'tab-test',
        document_id: 'document-test',
      },
    };
    host.emit(event);
    expect(record.addCustomEvent).not.toHaveBeenCalled();
    sdk.recordCancelCallback = jest.fn();
    host.emit(event);
    expect(record.addCustomEvent).toHaveBeenCalledWith('amp-semantic/visibility', event.payload);
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
  test('host callbacks resolve replay nodes, identity, URL, analytics settings and selector failures', () => {
    const { sdk, record } = prepare(true);
    const host = jest.mocked(createSemanticCapture).mock.calls[0][1];
    const internal = sdk as any;
    record.mirror.getNode.mockReturnValue(document.body);
    expect(host.getNode!(42)).toBe(document.body);
    record.mirror.getNode.mockReturnValue(null);
    expect(host.getNode!(42)).toBeNull();
    expect(host.getUrl()).toBe(window.location.href);
    expect(host.getIdentity!()).toEqual(
      expect.objectContaining({ tab_id: expect.any(String), document_id: expect.any(String) }),
    );
    expect(host.getAnalyticsContext!()).toEqual({ present: false, autocapture: [] });
    internal.config.semanticAnalyticsContext = { present: true, autocapture: ['elementInteractions'] };
    internal.config.performanceConfig = { interaction: { timeoutMs: 10 } };
    expect(host.getAnalyticsContext!()).toEqual({ present: true, autocapture: ['elementInteractions'] });
    expect(host.getSelector!(document.body)).toBe('button');
    expect(finder).toHaveBeenLastCalledWith(document.body, { timeoutMs: 1 });
    internal.clickHandler = new ClickHandler(internal.loggerProvider);
    expect(host.getSelector!(document.body)).toBe('button');
    jest.mocked(finder).mockImplementationOnce(() => {
      throw new Error('finder timeout');
    });
    expect(host.getSelector!(document.body)).toBeNull();
    const debug = jest.spyOn(internal.loggerProvider, 'debug');
    host.onError!(new Error('recorder failure'));
    expect(debug).toHaveBeenCalledWith('Semantic capture error:', expect.any(Error));
    internal.recordFunction.mirror.getId = undefined;
    expect(host.getNodeId(document.body)).toBe(-1);
    internal.recordFunction = undefined;
    internal.config = undefined;
    expect(host.getNodeId(document.body)).toBe(-1);
    expect(host.getNode!(42)).toBeNull();
    expect(host.getPrivacy()).toEqual({});
    expect(host.getAnalyticsContext!()).toEqual({ present: false, autocapture: [] });
    expect(host.getSelector!(document.body)).toBe('button');
    sdk.recordCancelCallback = jest.fn();
    host.emit({ name: 'visibility', timestamp: 1, payload: { state: 'hidden', v: 1, tab_id: 't', document_id: 'd' } });
    expect(record.addCustomEvent).not.toHaveBeenCalled();
  });

  test('can prepare before rrweb loads and skips setup when the browser document is unavailable', () => {
    const sdk = new SessionReplay();
    const internal = sdk as any;
    const config = { semanticCapture: { enabled: true }, privacyConfig: {} } as SessionReplayJoinedConfig;
    internal.prepareSemanticCapture(config, 1);
    expect(jest.mocked(createSemanticCapture).mock.calls[0][1].externalClicks).toBe(false);
    jest.mocked(getGlobalScope).mockReturnValue(undefined);
    internal.prepareSemanticCapture(config, 1);
    jest.mocked(getGlobalScope).mockReturnValue({} as typeof globalThis);
    internal.prepareSemanticCapture(config, 1);
    expect(createSemanticCapture).toHaveBeenCalledTimes(1);
  });

  test('stops the old semantic stream before switching sessions', async () => {
    const { sdk } = prepare(true);
    sdk.identifiers = { sessionId: 1, deviceId: 'device' } as typeof sdk.identifiers;
    sdk.recordEvents = jest.fn().mockResolvedValue(undefined);
    const stop = jest.spyOn(sdk, 'stopRecordingEvents');
    await sdk.asyncSetSessionId(2);
    expect(stop).toHaveBeenCalledWith('new_session');
  });

  test.each(['opt_out', 'targeting', 'sampled_out'])(
    'stops active semantics when recording eligibility becomes %s',
    async (reason) => {
      const { sdk } = prepare(true);
      const internal = sdk as any;
      sdk.recordCancelCallback = jest.fn();
      internal.config.targetingConfig = reason === 'targeting' ? {} : undefined;
      jest.spyOn(internal, 'getShouldRecord').mockReturnValue(false);
      jest.spyOn(internal, 'shouldOptOut').mockReturnValue(reason === 'opt_out');
      const stop = jest.spyOn(sdk, 'stopRecordingEvents');
      await internal._recordEvents();
      expect(stop).toHaveBeenCalledWith(reason);
      // A second eligibility check has no active recorder left to stop.
      stop.mockClear();
      await internal._recordEvents();
      expect(stop).not.toHaveBeenCalled();
    },
  );

  async function recordStream(sharedClicks = true) {
    const { sdk, record } = prepare(true, sharedClicks);
    const internal = sdk as any;
    sdk.identifiers = { sessionId: 1, deviceId: 'device' } as typeof sdk.identifiers;
    const cancel = jest.fn();
    record.mockReturnValue(cancel);
    internal.recordingEnabled = true;
    jest.spyOn(internal, 'getShouldRecord').mockReturnValue(true);
    jest.spyOn(internal, 'getRecordFunction').mockResolvedValue(record);
    jest.spyOn(internal, 'initializeNetworkObservers').mockResolvedValue(undefined);
    jest.spyOn(internal, 'getRecordingPlugins').mockResolvedValue([]);
    jest.spyOn(sdk, 'addCustomRRWebEvent').mockResolvedValue(undefined);
    await internal._recordEvents();
    const options = record.mock.calls[0][0];
    return { sdk, internal, record, cancel, options };
  }

  test('forwards the rrweb native click through the shared hook without a heatmap consumer', async () => {
    const { sdk, internal, options } = await recordStream();
    const event = new MouseEvent('click');
    const data = { id: 42, type: MouseInteractions.Click, x: 1, y: 2 };
    options.hooks.mouseInteraction(data, event);
    expect(capture.notify).toHaveBeenCalledWith('click', event);
    // An already queued click callback may arrive after reinitialization discarded the adapter.
    internal.semanticAdapter = undefined;
    expect(() => {
      options.hooks.mouseInteraction(data, event);
    }).not.toThrow();
    sdk.stopRecordingEvents();
    // Reuse the handler when the recorder restarts on focus.
    await internal._recordEvents();
    sdk.stopRecordingEvents();
  });

  test('accepts terminal semantic stop events before rrweb stops, but drops other events after opt-out', async () => {
    const { sdk, internal, options } = await recordStream();
    const stop = jest.spyOn(sdk, 'stopRecordingEvents');
    const enqueueEvent = jest.fn();
    internal.eventCompressor = { enqueueEvent };
    const optedOut = jest.spyOn(internal, 'shouldOptOut').mockReturnValue(false);
    const custom = {
      type: EventType.Custom,
      timestamp: 1,
      data: { tag: 'amp-semantic/recording', payload: undefined },
    };
    options.emit(custom);
    options.emit({ ...custom, data: { ...custom.data, payload: { state: 'start' } } });
    options.emit({ ...custom, data: { tag: 'other', payload: {} } });
    optedOut.mockReturnValue(true);
    options.emit({ ...custom, data: { ...custom.data, payload: { state: 'stop' } } });
    expect(enqueueEvent).toHaveBeenCalledTimes(4);
    options.emit(custom);
    expect(stop).toHaveBeenLastCalledWith('opt_out');
    expect(enqueueEvent).toHaveBeenCalledTimes(4);
    optedOut.mockReturnValue(false);
    internal.recordingEnabled = false;
    options.emit(custom);
    expect(stop).toHaveBeenLastCalledWith('customer_stop');
    internal.recordingEnabled = true;
    internal.config = undefined;
    internal.semanticAdapter = undefined;
    options.emit(custom);
    expect(enqueueEvent).toHaveBeenCalledTimes(5);
  });

  test('reports recorder startup failure to the semantic adapter', async () => {
    const { sdk, internal, record } = await recordStream(false);
    const stop = jest.spyOn(internal.semanticAdapter, 'stop');
    record.mockImplementationOnce(() => {
      throw new Error('rrweb failed');
    });
    await internal._recordEvents();
    expect(stop).toHaveBeenCalledWith('error');
    sdk.stopRecordingEvents();
  });

  test('shutdown emits the opt-out reason while the semantic adapter still exists', () => {
    const { sdk } = prepare(true);
    const internal = sdk as any;
    jest.spyOn(internal, 'shouldOptOut').mockReturnValue(true);
    const stop = jest.spyOn(sdk, 'stopRecordingEvents');
    sdk.shutdown();
    expect(stop).toHaveBeenCalledWith('opt_out');
  });
});
