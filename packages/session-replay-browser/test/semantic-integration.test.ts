import { createSemanticCapture as actualFactory } from '@amplitude/amp-semantic';
import type { SemanticCaptureFactory } from '../src/semantic-types';
import { getGlobalScope } from '@amplitude/analytics-core';
import { EventType } from '@amplitude/rrweb-types';
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

  function prepare(enabled: boolean) {
    const sdk = new SessionReplay();
    const config: Partial<SessionReplayJoinedConfig> = {
      semanticCapture: { enabled, createCapture: createSemanticCapture },
      privacyConfig: { defaultMaskLevel: 'conservative' },
    };
    sdk.config = config as SessionReplayJoinedConfig;
    const record = Object.assign(jest.fn(), {
      addCustomEvent: jest.fn(),
      takeFullSnapshot: jest.fn(),
      mirror: { getNode: jest.fn() },
    });
    const internal = sdk as any;
    internal.recordFunction = record;
    internal.prepareSemanticCapture(sdk.config, 1);
    return { sdk, record, internal };
  }

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

  test('skips setup without a browser document', () => {
    jest.mocked(getGlobalScope).mockReturnValue(undefined);
    prepare(true);
    jest.mocked(getGlobalScope).mockReturnValue({} as typeof globalThis);
    prepare(true);
    expect(createSemanticCapture).not.toHaveBeenCalled();
  });

  test('stops the old semantic stream before changing sessions', async () => {
    const { sdk } = prepare(true);
    sdk.identifiers = { sessionId: 1, deviceId: 'device' } as typeof sdk.identifiers;
    sdk.recordEvents = jest.fn().mockResolvedValue(undefined);
    const stop = jest.spyOn(sdk, 'stopRecordingEvents');
    await sdk.asyncSetSessionId(2);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(capture.stop).toHaveBeenCalled();
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
    expect(capture.notify).toHaveBeenCalledWith('snapshot', undefined);
    const enqueued = jest.fn();
    internal.eventCompressor = { enqueueEvent: enqueued };
    options.emit({ type: EventType.Custom, timestamp: 2, data: { tag: 'amp-semantic/context', payload: {} } });
    expect(enqueued).toHaveBeenCalledTimes(1);
    expect(capture.notify).toHaveBeenCalledTimes(1);
    jest.spyOn(internal, 'shouldOptOut').mockReturnValue(true);
    options.emit({ type: EventType.FullSnapshot, timestamp: 3, data: {} });
    expect(enqueued).toHaveBeenCalledTimes(1);
    expect(capture.notify).toHaveBeenCalledTimes(1);
    jest.spyOn(internal, 'shouldOptOut').mockReturnValue(false);
    record.mockImplementationOnce(() => {
      throw new Error('rrweb failed');
    });
    const stop = jest.spyOn(internal.semanticAdapter, 'stop');
    await internal._recordEvents();
    expect(stop).toHaveBeenCalled();
    sdk.stopRecordingEvents();
  });
});

test('the semantic package factory satisfies the public injection contract', () => {
  // A development-only dependency verifies compatibility without leaking it into production declarations.
  const factory: SemanticCaptureFactory = actualFactory;
  expect(typeof factory).toBe('function');
});
