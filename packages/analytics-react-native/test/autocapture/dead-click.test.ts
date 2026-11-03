import { setImmediate } from 'timers';
import { AppState, DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import type { AppStateStatus } from 'react-native';
import type { ReactNativeClient } from '@amplitude/analytics-core';
import { createDeadClickTracker } from '../../src/autocapture/dead-click';
import { ampCapture } from '../../src/amp-capture';
import { DEFAULT_ELEMENT_DEAD_CLICKED_EVENT } from '../../src/constants';
import { frustrationPlugin } from '../../src/plugins/frustration-plugin';
import { useDefaultConfig } from '../helpers/default';

const START = Date.parse('2026-01-01T00:00:00.000Z');
const TIMEOUT = 3_000;
const coordinates = { x: 20.5, y: 30.2 };
const properties = { '[Amplitude] Target Test ID': 'dead-button' };

type SignalState = {
  isProviding: boolean;
  sessionId: string;
  deviceId: string;
};

// RN's Promise polyfill schedules continuations on setImmediate. Keep it real
// while controlling the detector's clock and timeout with fake timers.
const settlePromises = () => new Promise<void>((resolve) => setImmediate(resolve));
const emitSignal = (
  type: 'interfaceChanged' | 'stateChanged',
  timestamp = Date.now(),
  module = 'PluginSessionReplayReactNative',
) => DeviceEventEmitter.emit(`${module}InterfaceSignal`, { type, timestamp });

const nativeSignalMethods = () => ({ addListener: jest.fn(), removeListeners: jest.fn() });

describe('dead click detection', () => {
  let originalPlatform: typeof Platform.OS;
  let originalAppState: typeof AppState.currentState;
  let originalReplay: unknown;
  let originalStandaloneReplay: unknown;
  let state: SignalState;
  let readState: jest.Mock<Promise<SignalState>, []>;
  let onDeadClick: jest.Mock;
  let config: ReturnType<typeof useDefaultConfig>;
  let trackers: ReturnType<typeof createDeadClickTracker>[];
  let appStateListener: (status: AppStateStatus) => void;
  let removeListener: jest.Mock;
  let teardownPlugin: (() => Promise<void>) | undefined;

  const createTracker = () => {
    const tracker = createDeadClickTracker(config, onDeadClick);
    trackers.push(tracker);
    return tracker;
  };

  const advance = async (milliseconds = TIMEOUT) => {
    jest.advanceTimersByTime(milliseconds);
    await settlePromises();
  };

  beforeEach(() => {
    originalPlatform = Platform.OS;
    originalAppState = AppState.currentState;
    originalReplay = NativeModules.PluginSessionReplayReactNative;
    originalStandaloneReplay = NativeModules.AMPNativeSessionReplay;
    Platform.OS = 'ios';
    AppState.currentState = 'active';
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    jest.setSystemTime(START);
    config = useDefaultConfig({ sessionId: 123, deviceId: 'device' });
    state = { isProviding: true, sessionId: '123', deviceId: 'device' };
    readState = jest.fn(() => Promise.resolve({ ...state }));
    NativeModules.PluginSessionReplayReactNative = { getInterfaceSignalState: readState, ...nativeSignalMethods() };
    delete NativeModules.AMPNativeSessionReplay;
    onDeadClick = jest.fn();
    trackers = [];
    teardownPlugin = undefined;
    removeListener = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      appStateListener = listener;
      return { remove: removeListener };
    });
  });

  afterEach(async () => {
    await teardownPlugin?.();
    trackers.forEach((tracker) => tracker.teardown());
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    Platform.OS = originalPlatform;
    AppState.currentState = originalAppState;
    NativeModules.PluginSessionReplayReactNative = originalReplay;
    NativeModules.AMPNativeSessionReplay = originalStandaloneReplay;
  });

  it('waits three seconds and reports the original press time and Kotlin event properties', async () => {
    createTracker().registerClickEvent(coordinates, properties);
    await settlePromises();
    await advance(TIMEOUT - 1);
    expect(onDeadClick).not.toHaveBeenCalled();
    await advance(1);
    expect(onDeadClick).toHaveBeenCalledTimes(1);
    expect(onDeadClick).toHaveBeenCalledWith(
      {
        ...properties,
        '[Amplitude] Begin Time': '2026-01-01T00:00:00.000Z',
        '[Amplitude] End Time': '2026-01-01T00:00:03.000Z',
        '[Amplitude] Duration': TIMEOUT,
        '[Amplitude] X': 20,
        '[Amplitude] Y': 30,
        '[Amplitude] Click Count': 1,
      },
      START,
    );
  });

  it.each(['before the initial native response', 'during the timeout'])(
    'suppresses a press when UI activity arrives %s',
    async (timing) => {
      const tracker = createTracker();
      tracker.registerClickEvent(coordinates, properties);
      if (timing === 'before the initial native response') emitSignal('interfaceChanged');
      await settlePromises();
      if (timing === 'during the timeout') emitSignal('interfaceChanged', START + 1_000);
      await advance();
      expect(onDeadClick).not.toHaveBeenCalled();
    },
  );

  it('keeps independent deadlines for successive presses', async () => {
    const tracker = createTracker();
    tracker.registerClickEvent(coordinates, properties);
    await settlePromises();
    await advance(1_000);
    tracker.registerClickEvent(coordinates, properties);
    await settlePromises();
    await advance(2_000);
    expect(onDeadClick).toHaveBeenCalledTimes(1);
    expect(onDeadClick.mock.calls[0][1]).toBe(START);
    await advance(1_000);
    expect(onDeadClick).toHaveBeenCalledTimes(2);
    expect(onDeadClick.mock.calls[1][1]).toBe(START + 1_000);
  });

  it.each([
    ['recording unavailable', { isProviding: false }],
    ['another session', { sessionId: 'other-session' }],
    ['another device', { deviceId: 'other-device' }],
  ])('requires matching Replay identity and availability: %s', async (_, override) => {
    Object.assign(state, override);
    createTracker().registerClickEvent(coordinates, properties);
    await settlePromises();
    await advance();
    expect(onDeadClick).not.toHaveBeenCalled();
    expect(readState).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['recording stopped', { isProviding: false }],
    ['session changed', { sessionId: 'other-session' }],
  ])('rechecks Replay at the deadline: %s', async (_, override) => {
    createTracker().registerClickEvent(coordinates, properties);
    await settlePromises();
    Object.assign(state, override);
    await advance();
    expect(readState).toHaveBeenCalledTimes(2);
    expect(onDeadClick).not.toHaveBeenCalled();
  });

  it.each(['before the initial response', 'during the timeout', 'during the final query'])(
    'invalidates in JavaScript when Replay stops and restarts %s',
    async (timing) => {
      let resolveState: (value: SignalState) => void = () => undefined;
      if (timing === 'during the final query') {
        readState.mockResolvedValueOnce({ ...state }).mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveState = resolve;
            }),
        );
      }
      createTracker().registerClickEvent(coordinates, properties);
      if (timing !== 'before the initial response') await settlePromises();
      if (timing === 'during the final query') await advance();

      // Final recording identity and availability are unchanged. Only the JS
      // observer saw that capture was interrupted between the two reads.
      emitSignal('stateChanged');
      emitSignal('stateChanged');
      if (timing === 'during the final query') resolveState({ ...state });
      await settlePromises();
      await advance();
      expect(onDeadClick).not.toHaveBeenCalled();
    },
  );

  it.each(['opt out', 'session change', 'device change'])('cancels when Analytics changes: %s', async (change) => {
    createTracker().registerClickEvent(coordinates, properties);
    await settlePromises();
    if (change === 'opt out') config.optOut = true;
    if (change === 'session change') config.sessionId = 456;
    if (change === 'device change') config.deviceId = 'other-device';
    await advance();
    expect(onDeadClick).not.toHaveBeenCalled();
  });

  it('cancels pending presses across background and foreground transitions', async () => {
    createTracker().registerClickEvent(coordinates, properties);
    await settlePromises();
    appStateListener('background');
    appStateListener('active');
    await advance();
    expect(onDeadClick).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not register a timeout after teardown during an in-flight initial query', async () => {
    const tracker = createTracker();
    tracker.registerClickEvent(coordinates, properties);
    tracker.teardown();
    await settlePromises();
    await advance();
    expect(onDeadClick).not.toHaveBeenCalled();
    expect(removeListener).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not emit after teardown during the final native query', async () => {
    let resolveState: (value: SignalState) => void = () => undefined;
    readState.mockResolvedValueOnce({ ...state }).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveState = resolve;
        }),
    );
    const tracker = createTracker();
    tracker.registerClickEvent(coordinates, properties);
    await settlePromises();
    await advance();
    tracker.teardown();
    resolveState({ ...state });
    await settlePromises();
    expect(onDeadClick).not.toHaveBeenCalled();
  });

  it.each(['web', 'missing Replay', 'old native binary', 'binary without event support'])(
    'safely skips detection with %s',
    async (scenario) => {
      if (scenario === 'web') Platform.OS = 'web';
      if (scenario === 'missing Replay') delete NativeModules.PluginSessionReplayReactNative;
      if (scenario === 'old native binary') NativeModules.PluginSessionReplayReactNative = {};
      if (scenario === 'binary without event support') {
        NativeModules.PluginSessionReplayReactNative = { getInterfaceSignalState: readState };
      }
      createTracker().registerClickEvent(coordinates, properties);
      await settlePromises();
      await advance();
      expect(readState).not.toHaveBeenCalled();
      expect(onDeadClick).not.toHaveBeenCalled();
    },
  );

  it.each(['opted out', 'background', 'disposed'])('ignores new presses while %s', async (scenario) => {
    const tracker = createTracker();
    if (scenario === 'opted out') config.optOut = true;
    if (scenario === 'background') AppState.currentState = 'background';
    if (scenario === 'disposed') tracker.teardown();
    tracker.registerClickEvent(coordinates, properties);
    await settlePromises();
    expect(readState).not.toHaveBeenCalled();
  });

  it.each(['initial query', 'final query'])(
    'handles a failed native %s without reporting a dead click',
    async (query) => {
      if (query === 'final query') readState.mockResolvedValueOnce({ ...state });
      readState.mockRejectedValueOnce(new Error('Native Replay unavailable'));
      createTracker().registerClickEvent(coordinates, properties);
      await settlePromises();
      await advance();
      expect(onDeadClick).not.toHaveBeenCalled();
    },
  );

  it('uses standalone Replay when the linked plugin is not recording', async () => {
    NativeModules.AMPNativeSessionReplay = {
      getInterfaceSignalState: jest.fn(() => Promise.resolve({ ...state })),
      ...nativeSignalMethods(),
    };
    readState.mockResolvedValue({ ...state, isProviding: false });
    createTracker().registerClickEvent(coordinates, properties);
    await settlePromises();
    await advance();
    expect(onDeadClick).toHaveBeenCalledTimes(1);
  });

  it('routes native signals to the selected Replay provider', async () => {
    NativeModules.AMPNativeSessionReplay = {
      getInterfaceSignalState: jest.fn(() => Promise.resolve({ ...state })),
      ...nativeSignalMethods(),
    };
    readState.mockResolvedValue({ ...state, isProviding: false });
    const tracker = createTracker();
    tracker.registerClickEvent(coordinates, properties);
    await settlePromises();
    emitSignal('stateChanged');
    emitSignal('interfaceChanged');
    await advance();
    expect(onDeadClick).toHaveBeenCalledTimes(1);

    tracker.registerClickEvent(coordinates, properties);
    await settlePromises();
    emitSignal('interfaceChanged', Date.now(), 'AMPNativeSessionReplay');
    await advance();
    expect(onDeadClick).toHaveBeenCalledTimes(1);
  });

  it('removes native event subscriptions during teardown', () => {
    const event = 'PluginSessionReplayReactNativeInterfaceSignal';
    const before = DeviceEventEmitter.listenerCount(event);
    const tracker = createTracker();
    expect(DeviceEventEmitter.listenerCount(event)).toBe(before + 1);
    tracker.teardown();
    expect(DeviceEventEmitter.listenerCount(event)).toBe(before);
  });

  it('tracks captured presses through the frustration plugin with screen and target properties', async () => {
    const track = jest.fn();
    const plugin = frustrationPlugin({ rageClick: false, errorClick: false, getScreenName: () => 'Test Screen' });
    teardownPlugin = async () => {
      await plugin.teardown?.();
    };
    await plugin.setup?.(config, { track } as unknown as ReactNativeClient);
    ampCapture((_event: unknown) => undefined, { action: 'Press', testID: 'dead-button' })({
      nativeEvent: { pageX: 20.5, pageY: 30.2 },
    });
    await settlePromises();
    await advance();
    expect(track).toHaveBeenCalledWith(
      DEFAULT_ELEMENT_DEAD_CLICKED_EVENT,
      expect.objectContaining({
        '[Amplitude] Screen Name': 'Test Screen',
        ...properties,
        '[Amplitude] Duration': TIMEOUT,
      }),
      { time: START },
    );
  });
});
