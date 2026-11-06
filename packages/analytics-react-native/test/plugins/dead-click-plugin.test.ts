import { setImmediate } from 'timers';
import type { ReactNativeClient } from '@amplitude/analytics-core';
import { AppState, Platform } from 'react-native';
import { ampCapture } from '../../src/amp-capture';
import { updateReactNativeConfigWithRemoteConfig } from '../../src/config/joined-config';
import { frustrationPlugin } from '../../src/plugins/frustration-plugin';
import { useDefaultConfig } from '../helpers/default';

// The optional Replay packages are required when the SDK module loads, which happens before top-level
// consts are initialized. Build the mock inside the factory and read it back with requireMock.
jest.mock('@amplitude/plugin-session-replay-react-native', () => {
  const listeners = new Set<() => void>();
  const unsubscribe = jest.fn();
  return {
    uiListeners: listeners,
    unsubscribeReplay: unsubscribe,
    isRecording: jest.fn(() => Promise.resolve(true)),
    addUiChangeListener: jest.fn((listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    }),
  };
});
jest.mock('@amplitude/session-replay-react-native', () => ({}));

const replay = jest.requireMock<{
  uiListeners: Set<() => void>;
  unsubscribeReplay: jest.Mock;
  isRecording: jest.Mock;
  addUiChangeListener: jest.Mock;
}>('@amplitude/plugin-session-replay-react-native');
const { uiListeners, unsubscribeReplay } = replay;

// RN's Promise polyfill uses setImmediate; keep it real while controlling click deadlines.
const settlePromises = () => new Promise<void>((resolve) => setImmediate(resolve));
const advance = async (milliseconds: number) => {
  await settlePromises();
  jest.advanceTimersByTime(milliseconds);
  await settlePromises();
};

describe('frustration plugin dead clicks', () => {
  let plugin: ReturnType<typeof frustrationPlugin>;
  let track: jest.Mock;
  const pressEvent = { nativeEvent: { pageX: 50.8, pageY: 60.3 } };
  const press = () => {
    ampCapture(jest.fn(), { action: 'Press', testID: 'button' })(pressEvent);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
    track = jest.fn();
    plugin = frustrationPlugin({ rageClick: false, errorClick: false, getScreenName: () => 'Home' });
  });

  afterEach(async () => {
    jest.clearAllTimers();
    jest.useRealTimers();
    await plugin.teardown?.();
    uiListeners.clear();
    jest.restoreAllMocks();
  });

  it('tracks a dead click by default with the captured element, screen and original time', async () => {
    await plugin.setup?.(useDefaultConfig(), { track } as unknown as ReactNativeClient);
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    const time = Date.now();
    press();
    await advance(3000);
    expect(track).toHaveBeenCalledWith(
      '[Amplitude] Dead Click',
      expect.objectContaining({
        '[Amplitude] Target Test ID': 'button',
        '[Amplitude] Screen Name': 'Home',
        '[Amplitude] Duration': 3000,
        '[Amplitude] X': 50,
        '[Amplitude] Y': 60,
      }),
      { time },
    );
  });

  it('can disable dead clicks without subscribing to Replay', async () => {
    plugin = frustrationPlugin({ deadClick: false, rageClick: false, errorClick: false });
    await plugin.setup?.(useDefaultConfig(), { track } as unknown as ReactNativeClient);
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    press();
    await advance(3000);
    expect(replay.addUiChangeListener).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  it.each([
    ['deadClicks', false, false],
    ['deadClicks', true, true],
    ['deadClick', false, false],
    ['deadClick', true, true],
    ['deadClicks', { enabled: false }, false],
    ['deadClicks', { enabled: true }, true],
    ['deadClick', { enabled: false }, false],
    ['deadClick', { enabled: true }, true],
  ] as const)('honors remote %s: %j after joining config', async (key, value, enabled) => {
    const config = useDefaultConfig({
      autocapture: { frustrationInteractions: { deadClick: !enabled } },
    });
    updateReactNativeConfigWithRemoteConfig({ autocapture: { frustrationInteractions: { [key]: value } } }, config);
    const autocapture = config.autocapture;
    if (!autocapture || typeof autocapture !== 'object') throw new Error('Expected autocapture options');
    const options = autocapture.frustrationInteractions;
    if (!options || typeof options !== 'object') throw new Error('Expected frustration options');
    plugin = frustrationPlugin({ ...options, rageClick: false, errorClick: false });
    await plugin.setup?.(config, { track } as unknown as ReactNativeClient);
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    press();
    await advance(3000);
    expect(replay.addUiChangeListener).toHaveBeenCalledTimes(enabled ? 1 : 0);
    const deadClickEvent = ['[Amplitude] Dead Click', expect.any(Object), expect.any(Object)];
    expect(track.mock.calls).toEqual(enabled ? [deadClickEvent] : []);
  });

  it('registers before the application handler and cancels on an immediate UI response', async () => {
    await plugin.setup?.(useDefaultConfig(), { track } as unknown as ReactNativeClient);
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    ampCapture((_event: typeof pressEvent) => uiListeners.forEach((listener) => listener()), { action: 'Press' })(
      pressEvent,
    );
    await advance(3000);
    expect(track).not.toHaveBeenCalled();
  });

  it('ignores long presses and presses without coordinates', async () => {
    await plugin.setup?.(useDefaultConfig(), { track } as unknown as ReactNativeClient);
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    ampCapture(jest.fn(), { action: 'LongPress' })(pressEvent);
    ampCapture(() => undefined, { action: 'Press' })();
    await advance(3000);
    expect(track).not.toHaveBeenCalled();
  });

  it.each(['onOptOutChanged', 'onSessionIdChanged'] as const)('clears pending presses on %s', async (method) => {
    await plugin.setup?.(useDefaultConfig(), { track } as unknown as ReactNativeClient);
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    press();
    if (method === 'onOptOutChanged') void plugin.onOptOutChanged?.(true);
    else void plugin.onSessionIdChanged?.(456);
    await advance(3000);
    expect(track).not.toHaveBeenCalled();
  });

  it('clears timers and capture subscriptions when removed', async () => {
    await plugin.setup?.(useDefaultConfig(), { track } as unknown as ReactNativeClient);
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    press();
    const teardown = plugin.teardown?.();
    press();
    await advance(3000);
    expect(track).not.toHaveBeenCalled();
    expect(unsubscribeReplay).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
    await teardown;
  });
});
