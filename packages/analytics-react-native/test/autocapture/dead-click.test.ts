import { AppState, Platform, type AppStateStatus } from 'react-native';
import { createDeadClickTracker } from '../../src/autocapture/dead-click';
import { useDefaultConfig } from '../helpers/default';

const pluginListeners = new Set<() => void>();
const standaloneListeners = new Set<() => void>();
const pluginReplay = { isRecording: jest.fn(), addUiChangeListener: jest.fn() };
const standaloneReplay = { isRecording: jest.fn(), addUiChangeListener: jest.fn() };

jest.mock('@amplitude/plugin-session-replay-react-native', () => pluginReplay);
jest.mock('@amplitude/session-replay-react-native', () => standaloneReplay);

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
    jest.useFakeTimers();
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
    pluginReplay.isRecording.mockReset().mockReturnValue(true);
    standaloneReplay.isRecording.mockReset().mockReturnValue(false);
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

  it('emits after three seconds with the original press time, element properties and coordinates', () => {
    const time = Date.now();
    create().registerClickEvent(coordinates, properties);
    jest.advanceTimersByTime(2999);
    expect(handler).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
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

  it('cancels a pending press on UI change without waiting for its timer', () => {
    create().registerClickEvent(coordinates, properties);
    jest.advanceTimersByTime(2999);
    pluginListeners.forEach((listener) => listener());
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps independent deadlines for repeated presses', () => {
    const tracker = create();
    const time = Date.now();
    tracker.registerClickEvent(coordinates, { id: 'first' });
    jest.advanceTimersByTime(1000);
    tracker.registerClickEvent(coordinates, { id: 'second' });
    jest.advanceTimersByTime(2000);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'first' }), time);
    jest.advanceTimersByTime(1000);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'second' }), time + 1000);
  });

  it('cancels all presses still inside their windows', () => {
    const tracker = create();
    tracker.registerClickEvent(coordinates, properties);
    jest.advanceTimersByTime(1000);
    tracker.registerClickEvent(coordinates, properties);
    pluginListeners.forEach((listener) => listener());
    jest.advanceTimersByTime(4000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not let a late UI notification cancel an already elapsed deadline', () => {
    create().registerClickEvent(coordinates, properties);
    jest.setSystemTime(Date.now() + 3001);
    pluginListeners.forEach((listener) => listener());
    jest.advanceTimersByTime(3000);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not register a press while Replay is stopped', () => {
    pluginReplay.isRecording.mockReturnValue(false);
    create().registerClickEvent(coordinates, properties);
    pluginReplay.isRecording.mockReturnValue(true);
    jest.advanceTimersByTime(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('suppresses a pending press if Replay has stopped by the deadline', () => {
    create().registerClickEvent(coordinates, properties);
    pluginReplay.isRecording.mockReturnValue(false);
    jest.advanceTimersByTime(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('supports standalone Replay independently of the plugin', () => {
    pluginReplay.isRecording.mockReturnValue(false);
    standaloneReplay.isRecording.mockReturnValue(true);
    const tracker = create();
    tracker.registerClickEvent(coordinates, properties);
    standaloneListeners.forEach((listener) => listener());
    jest.advanceTimersByTime(3000);
    expect(handler).not.toHaveBeenCalled();
    tracker.registerClickEvent(coordinates, properties);
    jest.advanceTimersByTime(3000);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('accepts any initially recording provider still recording at the deadline', () => {
    standaloneReplay.isRecording.mockReturnValue(true);
    create().registerClickEvent(coordinates, properties);
    pluginReplay.isRecording.mockReturnValue(false);
    jest.advanceTimersByTime(3000);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not substitute a provider that only started after the press', () => {
    create().registerClickEvent(coordinates, properties);
    pluginReplay.isRecording.mockReturnValue(false);
    standaloneReplay.isRecording.mockReturnValue(true);
    jest.advanceTimersByTime(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores UI notifications from sources that were not recording for this press', () => {
    create().registerClickEvent(coordinates, properties);
    standaloneListeners.forEach((listener) => listener());
    jest.advanceTimersByTime(3000);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('clears pending presses on backgrounding and ignores background presses', () => {
    const tracker = create();
    tracker.registerClickEvent(coordinates, properties);
    AppState.currentState = 'background';
    appStateChanged('background');
    AppState.currentState = 'active';
    appStateChanged('active');
    jest.advanceTimersByTime(3000);
    expect(handler).not.toHaveBeenCalled();
    AppState.currentState = 'background';
    tracker.registerClickEvent(coordinates, properties);
    jest.advanceTimersByTime(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(['sessionId', 'deviceId', 'optOut'] as const)('suppresses pending presses when %s changes', (field) => {
    create().registerClickEvent(coordinates, properties);
    if (field === 'sessionId') config.sessionId = 456;
    if (field === 'deviceId') config.deviceId = 'other-device';
    if (field === 'optOut') config.optOut = true;
    jest.advanceTimersByTime(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('cancels pending timers on explicit invalidation, even if identity later returns', () => {
    const tracker = create();
    tracker.registerClickEvent(coordinates, properties);
    tracker.clearPending();
    jest.advanceTimersByTime(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not register presses while Analytics is opted out', () => {
    config.optOut = true;
    create().registerClickEvent(coordinates, properties);
    config.optOut = false;
    jest.advanceTimersByTime(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('tears down all Replay and AppState subscriptions once and clears pending timers', () => {
    const tracker = create();
    tracker.registerClickEvent(coordinates, properties);
    tracker.teardown();
    tracker.teardown();
    tracker.registerClickEvent(coordinates, properties);
    pluginListeners.forEach((listener) => listener());
    jest.advanceTimersByTime(3000);
    expect(handler).not.toHaveBeenCalled();
    expect(unsubscribePlugin).toHaveBeenCalledTimes(1);
    expect(unsubscribeStandalone).toHaveBeenCalledTimes(1);
    expect(removeAppState).toHaveBeenCalledTimes(1);
  });

  it('disables detection on web without loading native Replay subscriptions', () => {
    Platform.OS = 'web';
    create().registerClickEvent(coordinates, properties);
    expect(pluginReplay.addUiChangeListener).not.toHaveBeenCalled();
    expect(standaloneReplay.addUiChangeListener).not.toHaveBeenCalled();
  });

  it('treats failed recording queries as unavailable providers', () => {
    pluginReplay.isRecording.mockImplementation(() => {
      throw new Error('unlinked');
    });
    create().registerClickEvent(coordinates, properties);
    jest.advanceTimersByTime(3000);
    expect(handler).not.toHaveBeenCalled();
  });

  it('uses the other provider when one Replay subscription fails', () => {
    pluginReplay.addUiChangeListener.mockImplementation(() => {
      throw new Error('unlinked');
    });
    standaloneReplay.isRecording.mockReturnValue(true);
    create().registerClickEvent(coordinates, properties);
    jest.advanceTimersByTime(3000);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
