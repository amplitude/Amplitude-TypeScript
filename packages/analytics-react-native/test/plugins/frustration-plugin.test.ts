import {
  DEFAULT_RAGE_CLICK_THRESHOLD,
  DEFAULT_RAGE_CLICK_WINDOW_MS,
  ReactNativeClient,
} from '@amplitude/analytics-core';
import * as Capture from '../../src/amp-capture';
import { frustrationPlugin, FRUSTRATION_PLUGIN_NAME } from '../../src/plugins/frustration-plugin';
import {
  DEFAULT_ELEMENT_DEAD_CLICKED_EVENT,
  DEFAULT_ELEMENT_RAGE_CLICKED_EVENT,
  DEFAULT_ELEMENT_ERROR_CLICKED_EVENT,
  SCREEN_NAME,
  TARGET_ACCESSIBILITY_LABEL,
  TARGET_ACTION,
  TARGET_COMPONENT,
  TARGET_ELEMENT,
  TARGET_TEST_ID,
} from '../../src/constants';
import { useDefaultConfig } from '../helpers/default';
import { subscribeToSessionReplayInterfaceSignals } from '../../src/autocapture/interface-signals';

jest.mock('../../src/autocapture/interface-signals', () => ({
  subscribeToSessionReplayInterfaceSignals: jest.fn(() => jest.fn()),
}));

describe('frustrationPlugin', () => {
  const pressEvent = { nativeEvent: { pageX: 100, pageY: 100 } };

  let amplitude: ReactNativeClient;
  let track: jest.Mock;
  let previousErrorUtils: unknown;
  let currentErrorHandler: ((error: unknown, isFatal?: boolean) => void) | undefined;
  let previousErrorHandler: jest.Mock;
  let interfaceSignalHandlers: {
    onInterfaceChanged: (time: number) => void;
    onProviderChanged: (isProviding: boolean) => void;
  };

  const press = (count: number, properties: Capture.AmpCaptureProperties = { action: 'Press', testID: 'button' }) => {
    for (let i = 0; i < count; i++) {
      Capture.ampCapture(jest.fn(), properties)(pressEvent);
    }
  };

  /**
   * Runs `fn` with fake timers. React Native's Promise polyfill schedules continuations on
   * `setImmediate`, so fake timers must not be active across an `await`.
   */
  const withFakeTimers = (fn: () => void) => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    try {
      fn();
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  };

  beforeEach(() => {
    track = jest.fn();
    amplitude = { track } as unknown as ReactNativeClient;
    previousErrorHandler = jest.fn();
    currentErrorHandler = previousErrorHandler;
    previousErrorUtils = (globalThis as any).ErrorUtils;
    jest.mocked(subscribeToSessionReplayInterfaceSignals).mockClear();
    jest.mocked(subscribeToSessionReplayInterfaceSignals).mockImplementation((handlers) => {
      interfaceSignalHandlers = handlers;
      return jest.fn();
    });
    (globalThis as any).ErrorUtils = {
      getGlobalHandler: jest.fn(() => currentErrorHandler),
      setGlobalHandler: jest.fn((handler) => {
        currentErrorHandler = handler;
      }),
    };
  });

  afterEach(() => {
    (globalThis as any).ErrorUtils = previousErrorUtils;
    jest.restoreAllMocks();
  });

  test('should be an enrichment plugin with the expected name', () => {
    const plugin = frustrationPlugin();
    expect(plugin.name).toBe(FRUSTRATION_PLUGIN_NAME);
    expect(plugin.type).toBe('enrichment');
  });

  test('should pass events through unchanged', async () => {
    const plugin = frustrationPlugin();
    const event = { event_type: 'custom' };
    expect(await plugin.execute?.(event)).toBe(event);
  });

  test('should track a rage click from repeated presses captured via ampCapture', async () => {
    const plugin = frustrationPlugin({ getScreenName: () => 'Home' });
    await plugin.setup?.(useDefaultConfig(), amplitude);

    withFakeTimers(() => {
      const start = Date.now();
      press(DEFAULT_RAGE_CLICK_THRESHOLD, { action: 'Press', testID: 'rage-button', component: 'Button' });
      expect(track).not.toHaveBeenCalled();

      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS);

      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledWith(
        DEFAULT_ELEMENT_RAGE_CLICKED_EVENT,
        {
          '[Amplitude] Begin Time': start,
          '[Amplitude] End Time': start,
          '[Amplitude] Duration': 0,
          '[Amplitude] Click Count': DEFAULT_RAGE_CLICK_THRESHOLD,
          '[Amplitude] Clicks': Array.from({ length: DEFAULT_RAGE_CLICK_THRESHOLD }, () => ({
            x: 100,
            y: 100,
            time: start,
          })),
          [SCREEN_NAME]: 'Home',
          [TARGET_ACCESSIBILITY_LABEL]: undefined,
          [TARGET_ACTION]: 'Press',
          [TARGET_COMPONENT]: 'Button',
          [TARGET_ELEMENT]: undefined,
          [TARGET_TEST_ID]: 'rage-button',
        },
        { time: start },
      );
    });

    await plugin.teardown?.();
  });

  test('should attach an undefined screen name when getScreenName is not provided', async () => {
    const plugin = frustrationPlugin();
    await plugin.setup?.(useDefaultConfig(), amplitude);

    withFakeTimers(() => {
      press(DEFAULT_RAGE_CLICK_THRESHOLD);
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS);

      expect(track).toHaveBeenCalledWith(
        DEFAULT_ELEMENT_RAGE_CLICKED_EVENT,
        expect.objectContaining({ [SCREEN_NAME]: undefined, [TARGET_TEST_ID]: 'button' }),
        expect.anything(),
      );
    });

    await plugin.teardown?.();
  });

  test('should ignore captures that are not presses or have no coordinates', async () => {
    const plugin = frustrationPlugin();
    await plugin.setup?.(useDefaultConfig(), amplitude);

    withFakeTimers(() => {
      press(DEFAULT_RAGE_CLICK_THRESHOLD, { action: 'ChangeText' });
      for (let i = 0; i < DEFAULT_RAGE_CLICK_THRESHOLD; i++) {
        Capture.ampCapture(jest.fn(), { action: 'Press' })();
      }
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS);

      expect(track).not.toHaveBeenCalled();
    });

    await plugin.teardown?.();
  });

  test('should not track rage clicks when rageClick is disabled', async () => {
    const plugin = frustrationPlugin({ rageClick: false });
    await plugin.setup?.(useDefaultConfig(), amplitude);

    withFakeTimers(() => {
      press(DEFAULT_RAGE_CLICK_THRESHOLD);
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS);

      expect(track).not.toHaveBeenCalled();
    });

    await plugin.teardown?.();
  });

  test('should track an error click when a press is followed by an exception', async () => {
    const plugin = frustrationPlugin({ getScreenName: () => 'Home' });
    await plugin.setup?.(useDefaultConfig(), amplitude);

    withFakeTimers(() => {
      const error = new Error('Press failed');
      press(1, { action: 'Press', testID: 'error-button', component: 'Button' });
      currentErrorHandler?.(error, true);

      expect(track).toHaveBeenCalledWith(DEFAULT_ELEMENT_ERROR_CLICKED_EVENT, {
        '[Amplitude] Kind': 'error',
        '[Amplitude] Message': 'Press failed',
        '[Amplitude] Stack': error.stack,
        '[Amplitude] Filename': undefined,
        '[Amplitude] Line Number': undefined,
        '[Amplitude] Column Number': undefined,
        [SCREEN_NAME]: 'Home',
        [TARGET_ACCESSIBILITY_LABEL]: undefined,
        [TARGET_ACTION]: 'Press',
        [TARGET_COMPONENT]: 'Button',
        [TARGET_ELEMENT]: undefined,
        [TARGET_TEST_ID]: 'error-button',
      });
      expect(previousErrorHandler).toHaveBeenCalledWith(error, true);
    });

    await plugin.teardown?.();
  });

  test('should track error clicks for long presses', async () => {
    const plugin = frustrationPlugin();
    await plugin.setup?.(useDefaultConfig(), amplitude);

    withFakeTimers(() => {
      Capture.ampCapture(jest.fn(), { action: 'LongPress', testID: 'long-press-button' })(pressEvent);
      currentErrorHandler?.('Long press failed');

      expect(track).toHaveBeenCalledWith(
        DEFAULT_ELEMENT_ERROR_CLICKED_EVENT,
        expect.objectContaining({
          '[Amplitude] Kind': 'error',
          '[Amplitude] Message': 'Long press failed',
          [TARGET_ACTION]: 'LongPress',
          [TARGET_TEST_ID]: 'long-press-button',
        }),
      );
    });

    await plugin.teardown?.();
  });

  test('should track unhandled rejections reported through ErrorUtils after a press', async () => {
    const addEventListener =
      typeof (globalThis as any).addEventListener === 'function'
        ? jest.spyOn(globalThis as any, 'addEventListener')
        : jest.fn();
    const removeEventListener =
      typeof (globalThis as any).removeEventListener === 'function'
        ? jest.spyOn(globalThis as any, 'removeEventListener')
        : jest.fn();
    const plugin = frustrationPlugin();
    await plugin.setup?.(useDefaultConfig(), amplitude);

    withFakeTimers(() => {
      const error = new Error('Promise failed');
      press(1, { action: 'Press', testID: 'rejection-button' });
      currentErrorHandler?.(error, false);

      expect(track).toHaveBeenCalledWith(
        DEFAULT_ELEMENT_ERROR_CLICKED_EVENT,
        expect.objectContaining({
          '[Amplitude] Kind': 'error',
          '[Amplitude] Message': 'Promise failed',
          [TARGET_TEST_ID]: 'rejection-button',
        }),
      );
      expect(previousErrorHandler).toHaveBeenCalledWith(error, false);
    });

    await plugin.teardown?.();
    expect(addEventListener).not.toHaveBeenCalled();
    expect(removeEventListener).not.toHaveBeenCalled();
  });

  test('should not track console errors by default', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const plugin = frustrationPlugin();
    await plugin.setup?.(useDefaultConfig(), amplitude);

    withFakeTimers(() => {
      press(1, { action: 'Press', testID: 'console-button' });
      console.error('Console failed');

      expect(track).not.toHaveBeenCalledWith(DEFAULT_ELEMENT_ERROR_CLICKED_EVENT, expect.anything());
    });

    await plugin.teardown?.();
  });

  test('should not track error clicks when errorClick is disabled', async () => {
    const plugin = frustrationPlugin({ errorClick: false });
    await plugin.setup?.(useDefaultConfig(), amplitude);

    withFakeTimers(() => {
      press(1, { action: 'Press', testID: 'error-button' });
      currentErrorHandler?.(new Error('Press failed'));

      expect(track).not.toHaveBeenCalledWith(DEFAULT_ELEMENT_ERROR_CLICKED_EVENT, expect.anything());
    });

    await plugin.teardown?.();
  });

  test('should track a dead click when session replay reports no interface change', async () => {
    const plugin = frustrationPlugin({ getScreenName: () => 'Home' });
    await plugin.setup?.(useDefaultConfig(), amplitude);

    withFakeTimers(() => {
      const start = Date.now();
      interfaceSignalHandlers.onProviderChanged(true);
      press(1, { action: 'Press', testID: 'dead-button', component: 'Button' });
      jest.advanceTimersByTime(3500);

      expect(track).toHaveBeenCalledWith(
        DEFAULT_ELEMENT_DEAD_CLICKED_EVENT,
        {
          [SCREEN_NAME]: 'Home',
          [TARGET_ACCESSIBILITY_LABEL]: undefined,
          [TARGET_ACTION]: 'Press',
          [TARGET_COMPONENT]: 'Button',
          [TARGET_ELEMENT]: undefined,
          [TARGET_TEST_ID]: 'dead-button',
          '[Amplitude] X Coordinate': 100,
          '[Amplitude] Y Coordinate': 100,
        },
        { time: start },
      );
    });

    await plugin.teardown?.();
  });

  test('should not track a dead click when session replay reports an interface change', async () => {
    const plugin = frustrationPlugin();
    await plugin.setup?.(useDefaultConfig(), amplitude);

    withFakeTimers(() => {
      interfaceSignalHandlers.onProviderChanged(true);
      press(1, { action: 'Press', testID: 'changed-button' });
      jest.advanceTimersByTime(100);
      interfaceSignalHandlers.onInterfaceChanged(Date.now());
      jest.advanceTimersByTime(3500);

      expect(track).not.toHaveBeenCalledWith(DEFAULT_ELEMENT_DEAD_CLICKED_EVENT, expect.anything(), expect.anything());
    });

    await plugin.teardown?.();
  });

  test('should not track dead clicks when deadClick is disabled', async () => {
    const plugin = frustrationPlugin({ deadClick: false });
    await plugin.setup?.(useDefaultConfig(), amplitude);

    withFakeTimers(() => {
      expect(subscribeToSessionReplayInterfaceSignals).not.toHaveBeenCalled();
      press(1, { action: 'Press', testID: 'dead-button' });
      jest.advanceTimersByTime(3500);

      expect(track).not.toHaveBeenCalledWith(DEFAULT_ELEMENT_DEAD_CLICKED_EVENT, expect.anything(), expect.anything());
    });

    await plugin.teardown?.();
  });

  test('should remove each error observer independently of teardown order', async () => {
    const firstTrack = jest.fn();
    const secondTrack = jest.fn();
    const firstPlugin = frustrationPlugin();
    const secondPlugin = frustrationPlugin();

    await firstPlugin.setup?.(useDefaultConfig(), { track: firstTrack } as unknown as ReactNativeClient);
    const sharedErrorHandler = currentErrorHandler;
    await secondPlugin.setup?.(useDefaultConfig(), { track: secondTrack } as unknown as ReactNativeClient);

    expect(currentErrorHandler).toBe(sharedErrorHandler);

    withFakeTimers(() => {
      press(1);
      currentErrorHandler?.(new Error('Both active'));
      expect(firstTrack).toHaveBeenCalledTimes(1);
      expect(secondTrack).toHaveBeenCalledTimes(1);

      firstTrack.mockClear();
      secondTrack.mockClear();
      void firstPlugin.teardown?.();

      press(1);
      currentErrorHandler?.(new Error('Only second active'));
      expect(firstTrack).not.toHaveBeenCalled();
      expect(secondTrack).toHaveBeenCalledTimes(1);

      void secondPlugin.teardown?.();
      expect(currentErrorHandler).toBe(previousErrorHandler);
    });
  });

  test('should stop tracking and cancel pending rage clicks on teardown', async () => {
    const plugin = frustrationPlugin();
    await plugin.setup?.(useDefaultConfig(), amplitude);

    withFakeTimers(() => {
      press(DEFAULT_RAGE_CLICK_THRESHOLD);
      expect(jest.getTimerCount()).toBeGreaterThan(0);

      // teardown() is async but its body runs synchronously before the first await boundary.
      void plugin.teardown?.();

      // The pending debounce timer was cleared, and later presses are no longer observed.
      expect(jest.getTimerCount()).toBe(0);
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS);
      press(DEFAULT_RAGE_CLICK_THRESHOLD);
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS);

      expect(track).not.toHaveBeenCalled();
    });
  });

  test('should tolerate teardown before setup', async () => {
    const plugin = frustrationPlugin();
    await expect(plugin.teardown?.()).resolves.toBeUndefined();
  });
});
