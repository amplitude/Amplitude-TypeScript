import { setImmediate } from 'timers';
import { AppState, DeviceEventEmitter, Platform } from 'react-native';
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

import type { InterfaceSignal } from '@amplitude/session-replay-react-native';

type Provider = { addInterfaceSignalListener?: jest.Mock };
const mockPluginReplay: Provider = {};
const mockStandaloneReplay: Provider = {};
jest.mock('@amplitude/plugin-session-replay-react-native', () => mockPluginReplay);
jest.mock('@amplitude/session-replay-react-native', () => mockStandaloneReplay);
const settlePromises = () => new Promise<void>((resolve) => setImmediate(resolve));
const listeners = {
  plugin: new Set<(signal: InterfaceSignal) => void>(),
  standalone: new Set<(signal: InterfaceSignal) => void>(),
};
let snapshot: InterfaceSignal;
let deliverInitial = true;
const subscribe = (provider: keyof typeof listeners) =>
  jest.fn((listener: (signal: InterfaceSignal) => void) => {
    listeners[provider].add(listener);
    if (deliverInitial) listener({ ...snapshot });
    return { remove: () => listeners[provider].delete(listener) };
  });
const emit = (changes: Partial<InterfaceSignal> = {}, provider: keyof typeof listeners = 'plugin') => {
  const signal = { ...snapshot, timestamp: Date.now(), ...changes };
  listeners[provider].forEach((listener) => listener(signal));
};

describe('dead click detection from Replay snapshots', () => {
  let originalPlatform: typeof Platform.OS;
  let originalAppState: typeof AppState.currentState;
  let config: ReturnType<typeof useDefaultConfig>;
  let onDeadClick: jest.Mock;
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
    Platform.OS = 'ios';
    AppState.currentState = 'active';
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    jest.setSystemTime(START);
    config = useDefaultConfig({ sessionId: 123, deviceId: 'device' });
    snapshot = {
      interfaceChanged: false,
      identityChanged: false,
      isProviding: true,
      sessionId: '123',
      deviceId: 'device',
      timestamp: START,
    };
    deliverInitial = true;
    listeners.plugin.clear();
    listeners.standalone.clear();
    mockPluginReplay.addInterfaceSignalListener = subscribe('plugin');
    delete mockStandaloneReplay.addInterfaceSignalListener;
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
  });

  it('reports an unchanged press after three seconds without querying Replay', async () => {
    createTracker().registerClickEvent(coordinates, properties);
    await advance(TIMEOUT - 1);
    expect(onDeadClick).not.toHaveBeenCalled();
    await advance(1);
    expect(onDeadClick).toHaveBeenCalledTimes(1);
    expect(onDeadClick).toHaveBeenCalledWith(
      expect.objectContaining({
        ...properties,
        '[Amplitude] Begin Time': new Date(START).toISOString(),
        '[Amplitude] End Time': new Date(START + TIMEOUT).toISOString(),
        '[Amplitude] Duration': TIMEOUT,
        '[Amplitude] X': 20,
        '[Amplitude] Y': 30,
        '[Amplitude] Click Count': 1,
      }),
      START,
    );
  });

  it('skips presses until the initial snapshot arrives without retroactively accepting them', async () => {
    deliverInitial = false;
    const tracker = createTracker();
    tracker.registerClickEvent(coordinates, properties);
    await advance(100);
    emit();
    await advance();
    expect(onDeadClick).not.toHaveBeenCalled();
    tracker.registerClickEvent(coordinates, properties);
    await advance();
    expect(onDeadClick).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['unavailable', { isProviding: false }],
    ['another session', { sessionId: 'other' }],
    ['another device', { deviceId: 'other' }],
    ['missing device', { deviceId: null }],
  ])('requires a matching available initial snapshot: %s', async (_, changes) => {
    Object.assign(snapshot, changes);
    createTracker().registerClickEvent(coordinates, properties);
    await advance();
    expect(onDeadClick).not.toHaveBeenCalled();
  });

  it.each(['UI change', 'recording stop', 'identity signal', 'session change', 'device change'])(
    'cancels a pending press after %s',
    async (change) => {
      createTracker().registerClickEvent(coordinates, properties);
      await advance(100);
      emit({
        interfaceChanged: change === 'UI change',
        isProviding: change !== 'recording stop',
        identityChanged: change === 'identity signal',
        ...(change === 'session change' ? { sessionId: 'other' } : {}),
        ...(change === 'device change' ? { deviceId: 'other' } : {}),
      });
      await advance();
      expect(onDeadClick).not.toHaveBeenCalled();
    },
  );

  it.each(['availability', 'session', 'device'])(
    'invalidates transient %s changes even when the final snapshot matches',
    async (change) => {
      createTracker().registerClickEvent(coordinates, properties);
      emit(
        change === 'availability'
          ? { isProviding: false }
          : change === 'session'
          ? { sessionId: 'other' }
          : { deviceId: 'other' },
      );
      emit();
      await advance();
      expect(onDeadClick).not.toHaveBeenCalled();
    },
  );

  it('accepts availability-only snapshots without inventing a UI change', async () => {
    const tracker = createTracker();
    tracker.registerClickEvent(coordinates, properties);
    await advance(100);
    emit();
    await advance();
    expect(onDeadClick).toHaveBeenCalledTimes(1);
  });

  it.each(['recording stopped', 'identity changed'])('processes combined flags when %s', async (change) => {
    createTracker().registerClickEvent(coordinates, properties);
    emit({
      interfaceChanged: true,
      timestamp: START - 1,
      isProviding: change !== 'recording stopped',
      identityChanged: change === 'identity changed',
    });
    await advance();
    expect(onDeadClick).not.toHaveBeenCalled();
  });

  it('keeps independent deadlines for successive presses', async () => {
    const tracker = createTracker();
    tracker.registerClickEvent(coordinates, properties);
    await advance(1000);
    tracker.registerClickEvent(coordinates, properties);
    await advance(2000);
    expect(onDeadClick).toHaveBeenCalledTimes(1);
    await advance(1000);
    expect(onDeadClick).toHaveBeenCalledTimes(2);
    expect(onDeadClick.mock.calls[0][1]).toBe(START);
    expect(onDeadClick.mock.calls[1][1]).toBe(START + 1000);
  });

  it.each(['opt out', 'session', 'device'])('cancels when Analytics changes %s', async (change) => {
    createTracker().registerClickEvent(coordinates, properties);
    if (change === 'opt out') config.optOut = true;
    if (change === 'session') config.sessionId = 456;
    if (change === 'device') config.deviceId = 'other';
    await advance();
    expect(onDeadClick).not.toHaveBeenCalled();
  });
  it('cancels pending candidates across app lifecycle changes', async () => {
    createTracker().registerClickEvent(coordinates, properties);
    appStateListener('background');
    appStateListener('active');
    await advance();
    expect(onDeadClick).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
  it('removes subscriptions and pending timers on teardown', async () => {
    const tracker = createTracker();
    tracker.registerClickEvent(coordinates, properties);
    expect(listeners.plugin.size).toBe(1);
    tracker.teardown();
    emit({ interfaceChanged: true });
    await advance();
    expect(onDeadClick).not.toHaveBeenCalled();
    expect(listeners.plugin.size).toBe(0);
    expect(removeListener).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
  it.each(['opted out', 'background', 'disposed'])('ignores new presses while %s', async (scenario) => {
    const tracker = createTracker();
    if (scenario === 'opted out') config.optOut = true;
    if (scenario === 'background') AppState.currentState = 'background';
    if (scenario === 'disposed') tracker.teardown();
    tracker.registerClickEvent(coordinates, properties);
    await advance();
    expect(onDeadClick).not.toHaveBeenCalled();
  });
  it.each(['web', 'old package', 'unsupported binary'])('disables detection with %s', async (scenario) => {
    if (scenario === 'web') Platform.OS = 'web';
    if (scenario === 'old package') delete mockPluginReplay.addInterfaceSignalListener;
    if (scenario === 'unsupported binary') deliverInitial = false;
    createTracker().registerClickEvent(coordinates, properties);
    await advance();
    expect(onDeadClick).not.toHaveBeenCalled();
  });
  it("uses the recording provider and ignores the inactive provider's signals", async () => {
    mockPluginReplay.addInterfaceSignalListener = jest.fn((listener) => {
      listeners.plugin.add(listener);
      listener({ ...snapshot, isProviding: false });
      return { remove: () => listeners.plugin.delete(listener) };
    });
    mockStandaloneReplay.addInterfaceSignalListener = subscribe('standalone');
    const tracker = createTracker();
    tracker.registerClickEvent(coordinates, properties);
    emit({ isProviding: false });
    emit({ interfaceChanged: true, isProviding: false });
    await advance();
    expect(onDeadClick).toHaveBeenCalledTimes(1);
    tracker.registerClickEvent(coordinates, properties);
    emit({ interfaceChanged: true }, 'standalone');
    await advance();
    expect(onDeadClick).toHaveBeenCalledTimes(1);
  });
  it('keeps a working provider when the other subscription fails', async () => {
    mockPluginReplay.addInterfaceSignalListener = jest.fn(() => {
      throw new Error('unavailable');
    });
    mockStandaloneReplay.addInterfaceSignalListener = subscribe('standalone');
    createTracker().registerClickEvent(coordinates, properties);
    await advance();
    expect(onDeadClick).toHaveBeenCalledTimes(1);
  });
  it.each(['no response', 'UI change', 'recording interruption'])(
    'uses the Android Replay wrapper without native listener methods: %s',
    async (response) => {
      Platform.OS = 'android';
      const nativeModule = {
        observeInterfaceSignals: jest.fn().mockResolvedValue({ ...snapshot, sequence: 1 }),
        stopObservingInterfaceSignals: jest.fn(),
      };
      // Exercise RN's real constructor checks; its preset emitter mock ignores native modules.
      const NativeEventEmitter = jest.requireActual<{ default: typeof import('react-native').NativeEventEmitter }>(
        'react-native/Libraries/EventEmitter/NativeEventEmitter',
      ).default;
      const warn = jest.spyOn(console, 'warn');
      const replayReactNative = require.resolve(
        '../../../plugin-session-replay-react-native/node_modules/react-native',
      );
      try {
        jest.isolateModules(() => {
          jest.doMock(replayReactNative, () => ({
            Platform: { OS: 'android', select: () => '' },
            NativeModules: { PluginSessionReplayReactNative: nativeModule },
            NativeEventEmitter,
          }));
          // Use the actual Replay wrapper behind the package's exported API.
          const replay = jest.requireActual<Provider>('../../../plugin-session-replay-react-native/src/native-module');
          mockPluginReplay.addInterfaceSignalListener = replay.addInterfaceSignalListener;
        });

        const eventName = 'PluginSessionReplayReactNativeInterfaceSignal';
        const initialListeners = DeviceEventEmitter.listenerCount(eventName);
        const tracker = createTracker();
        expect(DeviceEventEmitter.listenerCount(eventName)).toBe(initialListeners + 1);
        await settlePromises();
        tracker.registerClickEvent(coordinates, properties);
        await advance(1_000);
        if (response !== 'no response') {
          DeviceEventEmitter.emit(eventName, {
            ...snapshot,
            sequence: 2,
            interfaceChanged: response === 'UI change',
            identityChanged: false,
            isProviding: response !== 'recording interruption',
            timestamp: Date.now(),
          });
        }
        await advance(TIMEOUT - 1_000);
        expect(onDeadClick).toHaveBeenCalledTimes(response === 'no response' ? 1 : 0);
        expect(nativeModule.observeInterfaceSignals).toHaveBeenCalledTimes(1);
        expect(warn).not.toHaveBeenCalled();
        tracker.teardown();
        expect(nativeModule.stopObservingInterfaceSignals).toHaveBeenCalledTimes(1);
        expect(DeviceEventEmitter.listenerCount(eventName)).toBe(initialListeners);
      } finally {
        jest.dontMock(replayReactNative);
      }
    },
  );

  it.each(['@amplitude/plugin-session-replay-react-native', '@amplitude/session-replay-react-native'])(
    'tolerates an absent optional peer: %s',
    (missing) => {
      jest.isolateModules(() => {
        jest.doMock(missing, () => {
          throw new Error('Cannot find module');
        });
        const { createDeadClickTracker: create } =
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          require('../../src/autocapture/dead-click') as typeof import('../../src/autocapture/dead-click');
        const tracker = create(config, onDeadClick);
        expect(tracker).toBeDefined();
        tracker.teardown();
      });
      jest.doMock('@amplitude/plugin-session-replay-react-native', () => mockPluginReplay);
      jest.doMock('@amplitude/session-replay-react-native', () => mockStandaloneReplay);
    },
  );

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
