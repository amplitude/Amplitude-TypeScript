import {
  DEFAULT_RAGE_CLICK_THRESHOLD,
  DEFAULT_RAGE_CLICK_WINDOW_MS,
  ReactNativeClient,
} from '@amplitude/analytics-core';
import * as Capture from '../../src/amp-capture';
import { frustrationPlugin, FRUSTRATION_PLUGIN_NAME } from '../../src/plugins/frustration-plugin';
import {
  DEFAULT_ELEMENT_RAGE_CLICKED_EVENT,
  SCREEN_NAME,
  TARGET_ACCESSIBILITY_LABEL,
  TARGET_ACTION,
  TARGET_COMPONENT,
  TARGET_ELEMENT,
  TARGET_TEST_ID,
} from '../../src/constants';
import { useDefaultConfig } from '../helpers/default';

describe('frustrationPlugin', () => {
  const pressEvent = { nativeEvent: { pageX: 100, pageY: 100 } };

  let amplitude: ReactNativeClient;
  let track: jest.Mock;

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

  test('should stop tracking and cancel pending rage clicks on teardown', async () => {
    const plugin = frustrationPlugin();
    await plugin.setup?.(useDefaultConfig(), amplitude);

    withFakeTimers(() => {
      press(DEFAULT_RAGE_CLICK_THRESHOLD);
      expect(jest.getTimerCount()).toBe(1);

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
