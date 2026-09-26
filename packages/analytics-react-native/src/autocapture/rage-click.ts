import { DEFAULT_RAGE_CLICK_THRESHOLD, DEFAULT_RAGE_CLICK_WINDOW_MS } from '@amplitude/analytics-core';

// Captures Rage Clicks (when a button is pressed repeatedly within a certain time window)
type ClickEvent = {
  elementUniqueId: string;
  clickTimestamp: number;
  eventProperties: Record<string, any>;
};

type RageClickData = {
  firstClickTimestamp: number;
  lastClickTimestamp: number;
  clickCount: number;
  eventProperties: Record<string, any>;
};

type RageClickTracker = {
  registerClickEvent: (elementUniqueId: string, eventProperties: Record<string, any>) => void;
};

export function createRageClickTracker(rageClickHandler: (clickData: RageClickData) => void): RageClickTracker {
  let clickWindow: ClickEvent[] = [];
  let timeoutInterval: ReturnType<typeof setTimeout> | undefined;
  let firstClickEvent: ClickEvent | undefined;
  let clickCount = 0;
  let pendingRageClickData: RageClickData | undefined;

  function flush() {
    if (pendingRageClickData) {
      rageClickHandler(pendingRageClickData);
      pendingRageClickData = undefined;
      timeoutInterval && clearTimeout(timeoutInterval);
    }
    clickWindow = [];
    clickCount = 0;
    firstClickEvent = undefined;
  }

  /**
   * Register a click event
   * @param elementUniqueId - The unique identifier for the element that was clicked
   * @returns
   */
  function registerClickEvent(elementUniqueId: string, eventProperties: Record<string, any>) {
    const now = Date.now();

    // if we find a new element, or the current element is outside of the rage click window, flush the window
    const firstClickInWindow = clickWindow.length > 0 ? clickWindow[0] : null;
    const isOutsideWindow = firstClickInWindow && (now - firstClickInWindow.clickTimestamp) > DEFAULT_RAGE_CLICK_WINDOW_MS;
    const isDifferentElement = firstClickInWindow && firstClickInWindow.elementUniqueId !== elementUniqueId;
    if (isDifferentElement || isOutsideWindow) {
      flush();
    }
    
    const clickEvent: ClickEvent = {
      elementUniqueId,
      clickTimestamp: now,
      eventProperties,
    };
    if (clickWindow.length === 0) {
      firstClickEvent = clickEvent;
    }

    // add this click to the window; only keep the 4 most recent clicks to save memory
    clickWindow.push(clickEvent);
    clickCount++;
    if (clickWindow.length > DEFAULT_RAGE_CLICK_THRESHOLD) {
      clickWindow.shift();
    }

    // if below threshold, return
    if (clickWindow.length < DEFAULT_RAGE_CLICK_THRESHOLD) {
      return;
    }

    // we found a rage click, save the callback data for later
    pendingRageClickData = {
      firstClickTimestamp: firstClickEvent?.clickTimestamp ?? 0, // this is guaranteed to be defined
      lastClickTimestamp: clickWindow[clickWindow.length - 1].clickTimestamp,
      clickCount,
      eventProperties: firstClickEvent?.eventProperties ?? {},
    };

    // debounce: only send the rage click once there have been no clicks for a full window
    timeoutInterval && clearTimeout(timeoutInterval);
    timeoutInterval = setTimeout(flush, DEFAULT_RAGE_CLICK_WINDOW_MS);
  }

  return { registerClickEvent };
}
