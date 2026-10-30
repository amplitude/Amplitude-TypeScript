import { createSemanticCapture } from '@amplitude/amp-semantic';
import { getGlobalScope } from '@amplitude/analytics-core';
import { EventType } from '@amplitude/rrweb-types';
import { SessionReplay } from '../src/session-replay';
import { SessionReplayJoinedConfig } from '../src/config/types';

jest.mock('@amplitude/amp-semantic', () => ({
  ...jest.requireActual<typeof import('@amplitude/amp-semantic')>('@amplitude/amp-semantic'),
  createSemanticCapture: jest.fn(),
}));
jest.mock('@amplitude/analytics-core', () => ({
  ...jest.requireActual<typeof import('@amplitude/analytics-core')>('@amplitude/analytics-core'),
  getGlobalScope: jest.fn(),
}));
jest.mock('../src/worker', () => ({ compressionScript: '' }), { virtual: true });

describe('Session Replay context and visibility integration', () => {
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
      name: 'visibility' as const,
      timestamp: 123,
      payload: { v: 1 as const, state: 'hidden' as const, tab_id: 't', document_id: 'd' },
    };
    host.emit(event);
    expect(record.addCustomEvent).not.toHaveBeenCalled();
    sdk.recordCancelCallback = jest.fn();
    host.emit(event);
    expect(record.addCustomEvent).toHaveBeenCalledWith('amp-semantic/visibility', event.payload);
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
    options.emit({ type: EventType.Custom, timestamp: 2, data: { tag: 'amp-semantic/visibility', payload: {} } });
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
