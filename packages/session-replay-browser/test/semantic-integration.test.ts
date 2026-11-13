import { createSemanticCapture as actualFactory } from '@amplitude/amp-semantic';
import type { SemanticCaptureFactory } from '../src/semantic-types';
import { getGlobalScope } from '@amplitude/analytics-core';
import { EventType, MouseInteractions } from '@amplitude/rrweb-types';
import { SessionReplay } from '../src/session-replay';
import { SessionReplayJoinedConfig } from '../src/config/types';

jest.mock('@amplitude/analytics-core', () => ({
  ...jest.requireActual<typeof import('@amplitude/analytics-core')>('@amplitude/analytics-core'),
  getGlobalScope: jest.fn(),
}));
jest.mock('../src/worker', () => ({ compressionScript: '' }), { virtual: true });

describe('Session Replay context integration', () => {
  const createSemanticCapture = jest.fn<ReturnType<SemanticCaptureFactory>, Parameters<SemanticCaptureFactory>>();
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

  function prepare(enabled: boolean, nativeClicks = false) {
    const sdk = new SessionReplay();
    const config: Partial<SessionReplayJoinedConfig> = {
      semanticCapture: { enabled, createCapture: createSemanticCapture },
      privacyConfig: { defaultMaskLevel: 'conservative' },
    };
    sdk.config = config as SessionReplayJoinedConfig;
    const record = Object.assign(jest.fn(), {
      supportsNativeMouseInteraction: nativeClicks,
      addCustomEvent: jest.fn(),
      takeFullSnapshot: jest.fn(),
      mirror: { getNode: jest.fn(), getId: jest.fn(() => 42) },
    });
    const internal = sdk as any;
    internal.recordFunction = record;
    internal.prepareSemanticCapture(sdk.config, 1);
    return { sdk, record, internal };
  }

  test.each([true, false])('uses the native rrweb click hook only when supported (%s)', (supported) => {
    prepare(true, supported);
    const host = jest.mocked(createSemanticCapture).mock.calls[0][1];
    expect(host.externalClicks).toBe(supported);
    expect(host.externalAuxClicks).toBe(false);
  });

  test('supplies rrweb node IDs, current URL, and safe selector fallbacks', () => {
    const { sdk, record, internal } = prepare(true, true);
    const host = jest.mocked(createSemanticCapture).mock.calls[0][1];
    expect(host.getNodeId!(document.body)).toBe(42);
    record.mirror.getNode.mockReturnValue(document.body);
    expect(host.getNode!(42)).toBe(document.body);
    record.mirror.getNode.mockReturnValue(undefined);
    expect(host.getNode!(42)).toBeNull();
    expect(host.getUrl!()).toBe(window.location.href);
    expect(host.getSelector!(document.body)).toBeNull();
    internal.clickHandler = { getSelector: jest.fn(() => 'button') };
    expect(host.getSelector!(document.body)).toBe('button');
    internal.config.performanceConfig = { interaction: { timeoutMs: 50 } };
    internal.clickHandler.getSelector.mockReturnValue(null);
    expect(host.getSelector!(document.body)).toBeNull();
    expect(internal.clickHandler.getSelector).toHaveBeenCalledWith(document.body, { timeoutMs: 50 });
    const config = internal.config;
    internal.config = undefined;
    expect(host.getSelector!(document.body)).toBeNull();
    internal.config = config;
    internal.clickHandler.getSelector.mockImplementation(() => {
      throw new Error('finder');
    });
    expect(host.getSelector!(document.body)).toBeNull();
    internal.currentPageUrl = 'https://example.com/current';
    expect(host.getUrl!()).toBe('https://example.com/current');
    internal.recordFunction = undefined;
    expect(host.getNodeId!(document.body)).toBe(-1);
    expect(host.getNode!(42)).toBeNull();
    internal.semanticAdapter = undefined;
    internal.prepareSemanticCapture(sdk.config, 1);
    expect(jest.mocked(createSemanticCapture).mock.lastCall?.[1].externalClicks).toBe(false);
    sdk.stopRecordingEvents();
  });

  test('disabled capture does not construct a runtime or change session-switch behavior', async () => {
    const { sdk } = prepare(false);
    expect(createSemanticCapture).not.toHaveBeenCalled();
    sdk.identifiers = { sessionId: 1, deviceId: 'device' } as typeof sdk.identifiers;
    sdk.recordEvents = jest.fn().mockResolvedValue(undefined);
    const stop = jest.spyOn(sdk, 'stopRecordingEvents');
    await sdk.asyncSetSessionId(2);
    expect(stop).not.toHaveBeenCalled();
  });

  test('emits through rrweb only while recording and reads current privacy and analytics settings', () => {
    const { sdk, record, internal } = prepare(true);
    const host = jest.mocked(createSemanticCapture).mock.calls[0][1];
    const event = {
      name: 'context' as const,
      timestamp: 123,
      payload: {
        v: 1 as const,
        tab_id: 't',
        document_id: 'd',
        sdk: 'test',
        mask: 'medium' as const,
        css: { total: 0, inlined: 0, unreadable: 0 },
        viewport: { w: 1024, h: 768 },
        device: 'desktop' as const,
        language: 'en',
        visibility_state: 'visible' as const,
        focused: true,
        user_agent: 'test',
        analytics_sdk: { present: false, autocapture: [] },
      },
    };
    host.emit(event);
    expect(record.addCustomEvent).not.toHaveBeenCalled();
    sdk.recordCancelCallback = jest.fn();
    host.emit(event);
    expect(record.addCustomEvent).toHaveBeenCalledWith('amp-semantic/context', event.payload);
    expect(host.getPrivacy()).toEqual({ defaultMaskLevel: 'conservative' });
    expect(host.getIdentity!()).toEqual({ tab_id: expect.any(String), document_id: expect.any(String) });
    expect(host.getAnalyticsContext!()).toEqual({ present: false, autocapture: [] });
    internal.config.semanticAnalyticsContext = { present: true, autocapture: ['pageViews'] };
    expect(host.getAnalyticsContext!()).toEqual({ present: true, autocapture: ['pageViews'] });
    const debug = jest.spyOn(internal.loggerProvider, 'debug');
    host.onError!(new Error('test'));
    expect(debug).toHaveBeenCalledWith('Semantic capture error:', expect.any(Error));
    internal.config = undefined;
    internal.recordFunction = undefined;
    expect(host.getPrivacy()).toEqual({});
    expect(host.getAnalyticsContext!()).toEqual({ present: false, autocapture: [] });
    host.emit(event);
    expect(record.addCustomEvent).toHaveBeenCalledTimes(1);
  });

  test('contains rrweb custom-event failures without interrupting replay', () => {
    const { sdk, record, internal } = prepare(true);
    const cancelRecording = jest.fn();
    sdk.recordCancelCallback = cancelRecording;
    const error = new Error('rrweb custom event failed');
    record.addCustomEvent.mockImplementationOnce(() => {
      throw error;
    });
    const debug = jest.spyOn(internal.loggerProvider, 'debug');
    const host = jest.mocked(createSemanticCapture).mock.calls[0][1];
    expect(() => host.emit({ name: 'context', payload: {} } as Parameters<typeof host.emit>[0])).not.toThrow();
    expect(debug).toHaveBeenCalledWith('Error while adding semantic replay capture event:', error);
    expect(cancelRecording).not.toHaveBeenCalled();
  });

  test('turning capture off updates the retained runtime and clears its listeners', () => {
    const { sdk, internal } = prepare(true);
    internal.prepareSemanticCapture({ ...sdk.config, semanticCapture: { enabled: false } }, 1);
    expect(capture.stop).toHaveBeenCalled();
    expect(capture.updateConfig).toHaveBeenLastCalledWith({ enabled: false });
  });

  test('enabled capture without a local createCapture callback is inert, and removing it stops capture', () => {
    const { sdk, internal } = prepare(false);
    internal.prepareSemanticCapture({ semanticCapture: { enabled: true } }, 1);
    expect(createSemanticCapture).not.toHaveBeenCalled();
    internal.prepareSemanticCapture(
      { ...sdk.config, semanticCapture: { enabled: true, createCapture: createSemanticCapture } },
      1,
    );
    expect(createSemanticCapture).toHaveBeenCalledTimes(1);
    capture.stop.mockClear();
    internal.prepareSemanticCapture({ semanticCapture: { enabled: true } }, 1);
    expect(capture.stop).toHaveBeenCalled();
    expect(capture.updateConfig).toHaveBeenLastCalledWith({ enabled: false });
  });

  test('replaces the runtime when the supplied createCapture callback changes', () => {
    const { sdk, internal } = prepare(true);
    const next = jest.fn(() => capture);
    capture.stop.mockClear();
    internal.prepareSemanticCapture({ ...sdk.config, semanticCapture: { enabled: true, createCapture: next } }, 1);
    expect(capture.stop).toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(internal.semanticAdapter.createCapture).toBe(next);
  });

  test('a failing createCapture callback does not throw into replay initialization', () => {
    const { sdk, internal } = prepare(false);
    const error = new Error('factory failed');
    const factory = jest.fn(() => {
      throw error;
    });
    const debug = jest.spyOn(internal.loggerProvider, 'debug');
    expect(() => {
      internal.prepareSemanticCapture({ ...sdk.config, semanticCapture: { enabled: true, createCapture: factory } }, 1);
    }).not.toThrow();
    expect(internal.semanticAdapter).toBeUndefined();
    expect(debug).toHaveBeenCalledWith('Semantic capture initialization failed:', error);
  });

  test('a failing semantic prepare does not interrupt replay setup', () => {
    const { sdk, internal } = prepare(true);
    const error = new Error('update failed');
    capture.updateConfig.mockImplementationOnce(() => {
      throw error;
    });
    const debug = jest.spyOn(internal.loggerProvider, 'debug');
    expect(() => {
      internal.prepareSemanticCapture(sdk.config, 1);
    }).not.toThrow();
    expect(internal.semanticAdapter).toBeUndefined();
    expect(debug).toHaveBeenCalledWith('Semantic capture failed:', error);
  });

  test('a failing semantic stop still cancels rrweb and stops network observers', () => {
    const { sdk, internal } = prepare(true);
    const error = new Error('stop failed');
    const cancelRecording = jest.fn();
    const stopObservers = jest.fn();
    sdk.recordCancelCallback = cancelRecording;
    internal.networkObservers = { stop: stopObservers };
    capture.stop
      .mockImplementationOnce(() => {
        throw error;
      })
      .mockImplementationOnce(() => {
        throw error;
      });
    const debug = jest.spyOn(internal.loggerProvider, 'debug');
    sdk.stopRecordingEvents();
    expect(cancelRecording).toHaveBeenCalledTimes(1);
    expect(stopObservers).toHaveBeenCalledTimes(1);
    expect(internal.semanticAdapter).toBeUndefined();
    expect(debug).toHaveBeenCalledWith('Semantic capture failed:', error);
    expect(debug).toHaveBeenCalledWith('Semantic capture stop failed:', error);
  });

  test.each(['start', 'notify'] as const)('a failing semantic %s leaves rrweb recording', async (method) => {
    const { sdk, record, internal } = prepare(true);
    sdk.identifiers = { sessionId: 1, deviceId: 'device' } as typeof sdk.identifiers;
    internal.recordingEnabled = true;
    jest.spyOn(internal, 'getShouldRecord').mockReturnValue(true);
    jest.spyOn(internal, 'getRecordFunction').mockResolvedValue(record);
    jest.spyOn(internal, 'initializeNetworkObservers').mockResolvedValue(undefined);
    jest.spyOn(internal, 'getRecordingPlugins').mockResolvedValue([]);
    jest.spyOn(sdk, 'addCustomRRWebEvent').mockResolvedValue(undefined);
    const error = new Error(`${method} failed`);
    capture[method].mockImplementationOnce(() => {
      throw error;
    });
    const cancelRecording = jest.fn();
    record.mockImplementation((options) => {
      options.emit({ type: EventType.FullSnapshot, timestamp: 1, data: {} });
      return cancelRecording;
    });

    await internal._recordEvents();

    expect(sdk.recordCancelCallback).toBe(cancelRecording);
    expect(cancelRecording).not.toHaveBeenCalled();
    expect(internal.semanticAdapter).toBeUndefined();
  });

  test('skips setup without a browser document', () => {
    jest.mocked(getGlobalScope).mockReturnValue(undefined);
    prepare(true);
    jest.mocked(getGlobalScope).mockReturnValue({} as typeof globalThis);
    prepare(true);
    expect(createSemanticCapture).not.toHaveBeenCalled();
  });

  test('stops old semantics without interrupting rrweb during session config refetch', async () => {
    const { sdk, internal } = prepare(true);
    sdk.identifiers = { sessionId: 1, deviceId: 'device' } as typeof sdk.identifiers;
    const cancelRecording = jest.fn();
    sdk.recordCancelCallback = cancelRecording;
    let resolveConfig!: (value: { joinedConfig: SessionReplayJoinedConfig }) => void;
    internal.joinedConfigGenerator = {
      generateJoinedConfig: jest.fn(
        () => new Promise<{ joinedConfig: SessionReplayJoinedConfig }>((resolve) => (resolveConfig = resolve)),
      ),
    };
    const recordEvents = jest.fn().mockResolvedValue(undefined);
    sdk.recordEvents = recordEvents;
    const stop = jest.spyOn(sdk, 'stopRecordingEvents');
    capture.stop.mockClear();
    const sessionChange = sdk.asyncSetSessionId(2);
    expect(capture.stop).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    expect(cancelRecording).not.toHaveBeenCalled();
    expect(sdk.recordCancelCallback).toBe(cancelRecording);
    resolveConfig({ joinedConfig: sdk.config! });
    await sessionChange;
    expect(recordEvents).toHaveBeenCalled();
  });

  test('stops active semantic capture when replay becomes ineligible', async () => {
    const { sdk, internal } = prepare(true);
    sdk.recordCancelCallback = jest.fn();
    jest.spyOn(internal, 'getShouldRecord').mockReturnValue(false);
    const stop = jest.spyOn(sdk, 'stopRecordingEvents');
    await internal._recordEvents();
    expect(stop).toHaveBeenCalledTimes(1);
    stop.mockClear();
    await internal._recordEvents();
    expect(stop).not.toHaveBeenCalled();
  });

  test.each([
    { optOut: true, targeting: false, reason: 'opt_out' },
    { optOut: false, targeting: true, reason: 'targeting' },
    { optOut: false, targeting: false, reason: 'sampled_out' },
  ])('classifies an ineligible recording as $reason', async ({ optOut, targeting, reason }) => {
    const { sdk, internal } = prepare(true);
    sdk.identifiers = { sessionId: 1, deviceId: 'device' } as typeof sdk.identifiers;
    sdk.recordCancelCallback = jest.fn();
    sdk.config = { ...sdk.config!, targetingConfig: targeting ? ({} as any) : undefined };
    jest.spyOn(internal, 'getShouldRecord').mockReturnValue(false);
    jest.spyOn(internal, 'shouldOptOut').mockReturnValue(optOut);
    const stop = jest.spyOn(sdk, 'stopRecordingEvents');
    await internal._recordEvents();
    expect(stop).toHaveBeenCalledWith(reason);
  });

  test('handles an ineligible recording before config is available', async () => {
    const { sdk, internal } = prepare(true);
    sdk.recordCancelCallback = jest.fn();
    sdk.config = undefined;
    jest.spyOn(internal, 'getShouldRecord').mockReturnValue(false);
    jest.spyOn(internal, 'shouldOptOut').mockReturnValue(false);
    const stop = jest.spyOn(sdk, 'stopRecordingEvents');
    await internal._recordEvents();
    expect(stop).toHaveBeenCalledWith('sampled_out');
  });

  test('allows terminal recording custom events through the stop guard', async () => {
    const { sdk, record, internal } = prepare(true);
    sdk.identifiers = { sessionId: 1, deviceId: 'device' } as typeof sdk.identifiers;
    internal.recordingEnabled = true;
    jest.spyOn(internal, 'getShouldRecord').mockReturnValue(true);
    jest.spyOn(internal, 'getRecordFunction').mockResolvedValue(record);
    jest.spyOn(internal, 'initializeNetworkObservers').mockResolvedValue(undefined);
    jest.spyOn(internal, 'getRecordingPlugins').mockResolvedValue([]);
    jest.spyOn(sdk, 'addCustomRRWebEvent').mockResolvedValue(undefined);
    record.mockImplementation(() => jest.fn());
    await internal._recordEvents();
    const options = record.mock.calls[0][0];
    const enqueued = jest.fn();
    internal.eventCompressor = { enqueueEvent: enqueued };
    const stop = jest.spyOn(sdk, 'stopRecordingEvents');
    options.emit({ type: EventType.Custom, timestamp: 0, data: { tag: 'amp-semantic/recording' } });
    options.emit({
      type: EventType.Custom,
      timestamp: 0,
      data: { tag: 'amp-semantic/recording', payload: { state: 'start' } },
    });
    options.emit({ type: EventType.Custom, timestamp: 0, data: { tag: 'other', payload: { state: 'stop' } } });
    enqueued.mockClear();
    internal.recordingEnabled = false;
    options.emit({
      type: EventType.Custom,
      timestamp: 1,
      data: { tag: 'amp-semantic/recording', payload: { state: 'stop' } },
    });
    options.emit({
      type: EventType.Custom,
      timestamp: 2,
      data: { tag: 'amp-semantic/recording', payload: { state: 'pause' } },
    });
    expect(enqueued).toHaveBeenCalledTimes(2);
    expect(stop).not.toHaveBeenCalled();
  });

  test.each(['stop', 'shutdown'] as const)('%s tears down semantics before cancelling rrweb', (method) => {
    const { sdk } = prepare(true);
    const observed = jest.fn();
    sdk.recordCancelCallback = () => {
      observed(capture.stop.mock.calls.length);
    };
    capture.stop.mockClear();
    sdk[method]();
    expect(observed).toHaveBeenCalledWith(1);
  });

  test('connects accepted snapshots after recorder startup and never adds a click hook', async () => {
    const { sdk, record, internal } = prepare(true);
    sdk.identifiers = { sessionId: 1, deviceId: 'device' } as typeof sdk.identifiers;
    internal.recordingEnabled = true;
    jest.spyOn(internal, 'getShouldRecord').mockReturnValue(true);
    jest.spyOn(internal, 'getRecordFunction').mockResolvedValue(record);
    jest.spyOn(internal, 'initializeNetworkObservers').mockResolvedValue(undefined);
    jest.spyOn(internal, 'getRecordingPlugins').mockResolvedValue([]);
    jest.spyOn(sdk, 'addCustomRRWebEvent').mockResolvedValue(undefined);
    record.mockImplementation((options) => {
      options.emit({ type: EventType.FullSnapshot, timestamp: 1, data: {} });
      expect(capture.notify).not.toHaveBeenCalled();
      return jest.fn();
    });
    await internal._recordEvents();
    const options = record.mock.calls[0][0];
    expect(options.hooks.mouseInteraction).toBeUndefined();
    expect(capture.notify).toHaveBeenCalledWith('recording', { state: 'start', reason: 'init' });
    expect(capture.notify).toHaveBeenCalledWith('snapshot', undefined);
    const enqueued = jest.fn();
    internal.eventCompressor = { enqueueEvent: enqueued };
    options.emit({ type: EventType.Custom, timestamp: 2, data: { tag: 'amp-semantic/context', payload: {} } });
    expect(enqueued).toHaveBeenCalledTimes(1);
    expect(capture.notify).toHaveBeenCalledTimes(2);
    jest.spyOn(internal, 'shouldOptOut').mockReturnValue(true);
    options.emit({ type: EventType.FullSnapshot, timestamp: 3, data: {} });
    expect(enqueued).toHaveBeenCalledTimes(1);
    expect(capture.notify).toHaveBeenCalledWith('recording', { state: 'stop', reason: 'opt_out' });
    expect(capture.notify).toHaveBeenCalledTimes(3);
    jest.spyOn(internal, 'shouldOptOut').mockReturnValue(false);
    record.mockImplementationOnce(() => {
      throw new Error('rrweb failed');
    });
    const stop = jest.spyOn(internal.semanticAdapter, 'stop');
    await internal._recordEvents();
    expect(stop).toHaveBeenCalled();
    sdk.stopRecordingEvents();
  });

  test('forwards native rrweb clicks through the shared hook when heatmaps are off', async () => {
    const { sdk, record, internal } = prepare(true, true);
    sdk.identifiers = { sessionId: 1, deviceId: 'device' } as typeof sdk.identifiers;
    internal.recordingEnabled = true;
    jest.spyOn(internal, 'getShouldRecord').mockReturnValue(true);
    jest.spyOn(internal, 'getRecordFunction').mockResolvedValue(record);
    jest.spyOn(internal, 'initializeNetworkObservers').mockResolvedValue(undefined);
    jest.spyOn(internal, 'getRecordingPlugins').mockResolvedValue([]);
    jest.spyOn(sdk, 'addCustomRRWebEvent').mockResolvedValue(undefined);
    record.mockReturnValue(jest.fn());
    await internal._recordEvents();
    const options = record.mock.calls[0][0];
    const event = new MouseEvent('click');
    options.hooks.mouseInteraction({ id: 42, type: MouseInteractions.Click, x: 1, y: 2 }, event);
    expect(capture.notify).toHaveBeenCalledWith('click', event);
    options.hooks.mouseInteraction({ id: 42, type: MouseInteractions.MouseDown, x: 1, y: 2 }, event);
    expect(capture.notify.mock.calls.filter(([signal]) => signal === 'click')).toHaveLength(1);
    sdk.stopRecordingEvents();
  });

  test('reuses the existing click handler and tolerates a stopped adapter', async () => {
    const { sdk, record, internal } = prepare(true, true);
    const sharedHook = jest.fn(
      (_: unknown, semantic: (event: MouseEvent) => void) => (_data: unknown, event: MouseEvent) => semantic(event),
    );
    internal.clickHandler = { createSharedHook: sharedHook };
    sdk.identifiers = { sessionId: 1, deviceId: 'device' } as typeof sdk.identifiers;
    internal.recordingEnabled = true;
    jest.spyOn(internal, 'getShouldRecord').mockReturnValue(true);
    jest.spyOn(internal, 'getRecordFunction').mockResolvedValue(record);
    jest.spyOn(internal, 'initializeNetworkObservers').mockResolvedValue(undefined);
    jest.spyOn(internal, 'getRecordingPlugins').mockResolvedValue([]);
    jest.spyOn(sdk, 'addCustomRRWebEvent').mockResolvedValue(undefined);
    record.mockReturnValue(jest.fn());
    await internal._recordEvents();
    expect(sharedHook).toHaveBeenCalled();
    internal.semanticAdapter = undefined;
    expect(() => {
      record.mock.calls[0][0].hooks.mouseInteraction({ type: MouseInteractions.Click }, new MouseEvent('click'));
    }).not.toThrow();
    sdk.stopRecordingEvents();
  });
});

test('the semantic package factory satisfies the public injection contract', () => {
  // A development-only dependency verifies compatibility without leaking it into production declarations.
  const factory: SemanticCaptureFactory = actualFactory;
  expect(typeof factory).toBe('function');
});
