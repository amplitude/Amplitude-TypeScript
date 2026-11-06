import { setImmediate } from 'timers';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { createDeadClickTracker } from '../../src/autocapture/dead-click';
import { useDefaultConfig } from '../helpers/default';

const pluginListeners = new Set<() => void>();
const standaloneListeners = new Set<() => void>();

// The optional Replay packages are required when the SDK module loads, which happens before top-level
// consts are initialized. Build the mocks inside the factories and read them back with requireMock.
jest.mock('@amplitude/plugin-session-replay-react-native', () => ({
  isRecording: jest.fn(),
  addUiChangeListener: jest.fn(),
}));
jest.mock('@amplitude/session-replay-react-native', () => ({
  isRecording: jest.fn(),
  addUiChangeListener: jest.fn(),
}));

type ReplayMock = { isRecording: jest.Mock; addUiChangeListener: jest.Mock };
const pluginReplay = jest.requireMock<ReplayMock>('@amplitude/plugin-session-replay-react-native');
const standaloneReplay = jest.requireMock<ReplayMock>('@amplitude/session-replay-react-native');

// RN's Promise polyfill uses setImmediate; keep it real while controlling click deadlines.
const settlePromises = () => new Promise<void>((resolve) => setImmediate(resolve));
const advance = async (milliseconds: number) => {
  await settlePromises();
  jest.advanceTimersByTime(milliseconds);
  await settlePromises();
};

describe('dead click tracker with public Replay APIs', () => {
  let config: ReturnType<typeof useDefaultConfig>;
  let handler: jest.Mock;
  let trackers: ReturnType<typeof createDeadClickTracker>[];
  let appStateChanged: (state: AppStateStatus) => void;
  let removeAppState: jest.Mock;
  let unsubscribePlugin: jest.Mock;
  let unsubscribeStandalone: jest.Mock;
  const coordinates = { x: 12.8, y: -3.4 };
  const properties = { '[Amplitude] Target Test ID': 'button', '[Amplitude] Screen Name': 'Home' };
  const create = () => {
    const tracker = createDeadClickTracker(config, handler);
    trackers.push(tracker);
    return tracker;
  };

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    Platform.OS = 'ios';
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true, writable: true });
    config = useDefaultConfig({ sessionId: 123, deviceId: 'device' });
    handler = jest.fn();
    trackers = [];
    pluginListeners.clear();
    standaloneListeners.clear();
    unsubscribePlugin = jest.fn(() => pluginListeners.clear());
    unsubscribeStandalone = jest.fn(() => standaloneListeners.clear());
    pluginReplay.isRecording.mockReset().mockResolvedValue(true);
    standaloneReplay.isRecording.mockReset().mockResolvedValue(false);
    pluginReplay.addUiChangeListener.mockReset().mockImplementation((listener: () => void) => {
      pluginListeners.add(listener);
      return unsubscribePlugin;
    });
    standaloneReplay.addUiChangeListener.mockReset().mockImplementation((listener: () => void) => {
      standaloneListeners.add(listener);
      return unsubscribeStandalone;
    });
    removeAppState = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      appStateChanged = listener;
      return { remove: removeAppState };
    });
  });

  afterEach(() => {
    trackers.forEach((tracker) => tracker.teardown());
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('emits after three seconds with the original press time, element properties and coordinates', async () => {
    const time = Date.now();
    create().registerClickEvent(coordinates, properties);
    await advance(2999);
    expect(handler).not.toHaveBeenCalled();
    await advance(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      {
        ...properties,
        '[Amplitude] Begin Time': new Date(time).toISOString(),
        '[Amplitude] End Time': new Date(time + 3000).toISOString(),
        '[Amplitude] Duration': 3000,
        '[Amplitude] Click Count': 1,
        '[Amplitude] X': 12,
        '[Amplitude] Y': -3,
      },
      time,
    );
  });

  it('cancels a pending press on UI change without waiting for its timer', async () => {
    create().registerClickEvent(coordinates, properties);
    await advance(2999);
    pluginListeners.forEach((listener) => listener());
    expect(jest.getTimerCount()).toBe(0);
    await advance(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps independent deadlines for repeated presses', async () => {
    const tracker = create();
    const time = Date.now();
    tracker.registerClickEvent(coordinates, { id: 'first' });
    await advance(1000);
    tracker.registerClickEvent(coordinates, { id: 'second' });
    await advance(2000);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'first' }), time);
    await advance(1000);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'second' }), time + 1000);
  });

  it('cancels all presses still inside their windows', async () => {
    const tracker = create();
    tracker.registerClickEvent(coordinates, properties);
    await advance(1000);
    tracker.registerClickEvent(coordinates, properties);
    pluginListeners.forEach((listener) => listener());
    await advance(4000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not let a late UI notification cancel an already elapsed deadline', async () => {
    create().registerClickEvent(coordinates, properties);
    jest.setSystemTime(Date.now() + 3001);
    pluginListeners.forEach((listener) => listener());
    await advance(3000);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not register a press while Replay is stopped', async () => {
    pluginReplay.isRecording.mockResolvedValue(false);
    create().registerClickEvent(coordinates, properties);
    pluginReplay.isRecording.mockResolvedValue(true);
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('suppresses a pending press if Replay has stopped by the deadline', async () => {
    create().registerClickEvent(coordinates, properties);
    pluginReplay.isRecording.mockResolvedValue(false);
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports standalone Replay independently of the plugin', async () => {
    pluginReplay.isRecording.mockResolvedValue(false);
    standaloneReplay.isRecording.mockResolvedValue(true);
    const tracker = create();
    tracker.registerClickEvent(coordinates, properties);
    standaloneListeners.forEach((listener) => listener());
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
    tracker.registerClickEvent(coordinates, properties);
    await advance(3000);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('accepts any initially recording provider still recording at the deadline', async () => {
    standaloneReplay.isRecording.mockResolvedValue(true);
    create().registerClickEvent(coordinates, properties);
    pluginReplay.isRecording.mockResolvedValue(false);
    await advance(3000);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not substitute a provider that only started after the press', async () => {
    create().registerClickEvent(coordinates, properties);
    pluginReplay.isRecording.mockResolvedValue(false);
    standaloneReplay.isRecording.mockResolvedValue(true);
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores UI notifications from sources that were not recording for this press', async () => {
    create().registerClickEvent(coordinates, properties);
    standaloneListeners.forEach((listener) => listener());
    await advance(3000);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('clears pending presses on backgrounding and ignores background presses', async () => {
    const tracker = create();
    tracker.registerClickEvent(coordinates, properties);
    AppState.currentState = 'background';
    appStateChanged('background');
    AppState.currentState = 'active';
    appStateChanged('active');
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
    AppState.currentState = 'background';
    tracker.registerClickEvent(coordinates, properties);
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(['sessionId', 'deviceId', 'optOut'] as const)('suppresses pending presses when %s changes', async (field) => {
    create().registerClickEvent(coordinates, properties);
    if (field === 'sessionId') config.sessionId = 456;
    if (field === 'deviceId') config.deviceId = 'other-device';
    if (field === 'optOut') config.optOut = true;
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('cancels pending timers on explicit invalidation, even if identity later returns', async () => {
    const tracker = create();
    tracker.registerClickEvent(coordinates, properties);
    tracker.clearPending();
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not register presses while Analytics is opted out', async () => {
    config.optOut = true;
    create().registerClickEvent(coordinates, properties);
    config.optOut = false;
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('tears down all Replay and AppState subscriptions once and clears pending timers', async () => {
    const tracker = create();
    tracker.registerClickEvent(coordinates, properties);
    tracker.teardown();
    tracker.teardown();
    tracker.registerClickEvent(coordinates, properties);
    pluginListeners.forEach((listener) => listener());
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
    expect(unsubscribePlugin).toHaveBeenCalledTimes(1);
    expect(unsubscribeStandalone).toHaveBeenCalledTimes(1);
    expect(removeAppState).toHaveBeenCalledTimes(1);
  });

  it('disables detection on web without loading native Replay subscriptions', async () => {
    Platform.OS = 'web';
    create().registerClickEvent(coordinates, properties);
    expect(pluginReplay.addUiChangeListener).not.toHaveBeenCalled();
    expect(standaloneReplay.addUiChangeListener).not.toHaveBeenCalled();
  });

  it('treats failed recording queries as unavailable providers', async () => {
    pluginReplay.isRecording.mockImplementation(() => {
      throw new Error('unlinked');
    });
    create().registerClickEvent(coordinates, properties);
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('uses the other provider when one Replay subscription fails', async () => {
    pluginReplay.addUiChangeListener.mockImplementation(() => {
      throw new Error('unlinked');
    });
    standaloneReplay.isRecording.mockResolvedValue(true);
    create().registerClickEvent(coordinates, properties);
    await advance(3000);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('keeps the original deadline when the initial recording query takes time', async () => {
    let resolveState: (value: boolean) => void = () => undefined;
    pluginReplay.isRecording.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveState = resolve;
      }),
    );
    const time = Date.now();
    create().registerClickEvent(coordinates, properties);
    await advance(2500);
    resolveState(true);
    await advance(499);
    expect(handler).not.toHaveBeenCalled();
    await advance(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ '[Amplitude] Duration': 3000 }), time);
  });

  it('remembers UI changes while the initial recording query is pending', async () => {
    let resolveState: (value: boolean) => void = () => undefined;
    pluginReplay.isRecording.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveState = resolve;
      }),
    );
    create().registerClickEvent(coordinates, properties);
    pluginListeners.forEach((listener) => listener());
    resolveState(true);
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not start another three-second window if the initial query resolves after the deadline', async () => {
    let resolveState: (value: boolean) => void = () => undefined;
    pluginReplay.isRecording.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveState = resolve;
      }),
    );
    const time = Date.now();
    create().registerClickEvent(coordinates, properties);
    await advance(4000);
    resolveState(true);
    await advance(0);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        '[Amplitude] End Time': new Date(time + 3000).toISOString(),
      }),
      time,
    );
  });

  it('does not resurrect a press when the initial query resolves after teardown', async () => {
    let resolveState: (value: boolean) => void = () => undefined;
    pluginReplay.isRecording.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveState = resolve;
      }),
    );
    const tracker = create();
    tracker.registerClickEvent(coordinates, properties);
    tracker.teardown();
    resolveState(true);
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rechecks teardown after the final recording query resolves', async () => {
    let resolveState: (value: boolean) => void = () => undefined;
    pluginReplay.isRecording.mockResolvedValueOnce(true).mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveState = resolve;
      }),
    );
    const tracker = create();
    tracker.registerClickEvent(coordinates, properties);
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
    tracker.teardown();
    resolveState(true);
    await settlePromises();
    expect(handler).not.toHaveBeenCalled();
  });

  it('treats a rejected final recording query as not recording', async () => {
    pluginReplay.isRecording.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('bridge destroyed'));
    create().registerClickEvent(coordinates, properties);
    await advance(3000);
    expect(handler).not.toHaveBeenCalled();
  });
});
