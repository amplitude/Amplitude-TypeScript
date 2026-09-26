import { DEFAULT_RAGE_CLICK_THRESHOLD, DEFAULT_RAGE_CLICK_WINDOW_MS } from '@amplitude/analytics-core';
import { createRageClickTracker } from '../../src/autocapture/rage-click';

describe('rage-click', () => {
  let rageClickTracker: ReturnType<typeof createRageClickTracker>;
  let handler: jest.Mock;

  const ELEMENT_A = 'element-a';
  const ELEMENT_B = 'element-b';
  const PROPERTIES_A: Record<string, unknown> = { '[Amplitude] Target Test ID': 'button-a' };
  const PROPERTIES_B: Record<string, unknown> = { '[Amplitude] Target Test ID': 'button-b' };

  /**
   * Registers `count` clicks on `elementUniqueId`, advancing the fake clock by `gapMs`
   * between each click.
   */
  const clickTimes = (count: number, elementUniqueId = ELEMENT_A, gapMs = 0, properties = PROPERTIES_A) => {
    for (let i = 0; i < count; i++) {
      if (i > 0 && gapMs > 0) {
        jest.advanceTimersByTime(gapMs);
      }
      rageClickTracker.registerClickEvent(elementUniqueId, properties);
    }
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    handler = jest.fn();
    rageClickTracker = createRageClickTracker(handler);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('registerClickEvent', () => {
    test('does not trigger a rage click with fewer than threshold clicks', () => {
      clickTimes(DEFAULT_RAGE_CLICK_THRESHOLD - 1);
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS * 2);

      expect(handler).not.toHaveBeenCalled();
    });

    test('triggers a rage click when threshold clicks occur within the window', () => {
      clickTimes(DEFAULT_RAGE_CLICK_THRESHOLD);
      expect(handler).not.toHaveBeenCalled();

      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('does not trigger a rage click when clicks are spread beyond the window', () => {
      // Each click is spaced so that the threshold-th click falls outside the window
      // relative to the first.
      const gap = Math.ceil(DEFAULT_RAGE_CLICK_WINDOW_MS / (DEFAULT_RAGE_CLICK_THRESHOLD - 1)) + 1;
      clickTimes(DEFAULT_RAGE_CLICK_THRESHOLD, ELEMENT_A, gap);
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS * 2);

      expect(handler).not.toHaveBeenCalled();
    });

    test('fires the handler only after the window has elapsed since the last click', () => {
      clickTimes(DEFAULT_RAGE_CLICK_THRESHOLD, ELEMENT_A, 100);

      // One ms before the window closes: nothing yet.
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS - 1);
      expect(handler).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('tracks a single rage click while the user keeps clicking continuously', () => {
      const totalClicks = 20;
      clickTimes(totalClicks, ELEMENT_A, 200);
      expect(handler).not.toHaveBeenCalled();

      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].clickCount).toBe(totalClicks);
    });

    test('passes first/last click timestamps, click count and event properties to the handler', () => {
      const start = Date.now();
      const gap = 50;
      clickTimes(DEFAULT_RAGE_CLICK_THRESHOLD, ELEMENT_A, gap);
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS);

      expect(handler).toHaveBeenCalledWith({
        firstClickTimestamp: start,
        lastClickTimestamp: start + gap * (DEFAULT_RAGE_CLICK_THRESHOLD - 1),
        clickCount: DEFAULT_RAGE_CLICK_THRESHOLD,
        eventProperties: PROPERTIES_A,
      });
    });

    test('debounces: additional clicks after the threshold delay the handler and increase the count', () => {
      clickTimes(DEFAULT_RAGE_CLICK_THRESHOLD);
      // Keep clicking every 200ms; the handler should keep being pushed out.
      const extraClicks = 3;
      clickTimes(extraClicks, ELEMENT_A, 200);
      expect(handler).not.toHaveBeenCalled();

      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].clickCount).toBe(DEFAULT_RAGE_CLICK_THRESHOLD + extraClicks);
    });

    test('flushes a pending rage click immediately when a late click falls outside the window', () => {
      clickTimes(DEFAULT_RAGE_CLICK_THRESHOLD);
      expect(handler).not.toHaveBeenCalled();

      // Simulate a delayed timer (e.g. busy JS thread): move the clock past the window
      // without firing the scheduled timeout, then click again on the same element.
      jest.setSystemTime(Date.now() + DEFAULT_RAGE_CLICK_WINDOW_MS + 1);
      clickTimes(1);

      // The late click is not part of the rage click; the pending one is sent as-is.
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].clickCount).toBe(DEFAULT_RAGE_CLICK_THRESHOLD);

      // The scheduled timeout was cleared, so it must not fire a second time.
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS * 2);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('resets the click window when a different element is clicked', () => {
      clickTimes(DEFAULT_RAGE_CLICK_THRESHOLD - 1, ELEMENT_A);
      clickTimes(1, ELEMENT_B, 0, PROPERTIES_B);
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS * 2);

      expect(handler).not.toHaveBeenCalled();
    });

    test('uses the event properties of the first click in the window', () => {
      clickTimes(DEFAULT_RAGE_CLICK_THRESHOLD - 1, ELEMENT_A, 0, PROPERTIES_A);
      // Same element, different properties on the final click.
      clickTimes(1, ELEMENT_A, 0, { ...PROPERTIES_A, extra: true });
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].eventProperties).toEqual(PROPERTIES_A);
    });

    test('clears the click window after firing so the next burst is tracked independently', () => {
      clickTimes(DEFAULT_RAGE_CLICK_THRESHOLD);
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS);
      expect(handler).toHaveBeenCalledTimes(1);

      // A second burst on the same element should produce a fresh rage click with its own count.
      clickTimes(DEFAULT_RAGE_CLICK_THRESHOLD);
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS);
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler.mock.calls[1][0].clickCount).toBe(DEFAULT_RAGE_CLICK_THRESHOLD);
    });

    test('keeps trackers independent of one another', () => {
      const otherHandler = jest.fn();
      const otherTracker = createRageClickTracker(otherHandler);

      clickTimes(DEFAULT_RAGE_CLICK_THRESHOLD);
      for (let i = 0; i < DEFAULT_RAGE_CLICK_THRESHOLD - 1; i++) {
        otherTracker.registerClickEvent(ELEMENT_B, PROPERTIES_B);
      }
      jest.advanceTimersByTime(DEFAULT_RAGE_CLICK_WINDOW_MS);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(otherHandler).not.toHaveBeenCalled();
    });
  });
});
