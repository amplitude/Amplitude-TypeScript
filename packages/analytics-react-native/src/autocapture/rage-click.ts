import {
  DEFAULT_RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD,
  DEFAULT_RAGE_CLICK_THRESHOLD,
  DEFAULT_RAGE_CLICK_WINDOW_MS,
} from '@amplitude/analytics-core';
import type { AmpCaptureCoordinates } from '../amp-capture';

// Captures Rage Clicks (when a button is pressed repeatedly within a certain time window)
type ClickEvent = {
  coordinates: AmpCaptureCoordinates;
  clickTimestamp: number;
  eventProperties: Record<string, any>;
};

type ClickRegionBoundingBox = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export type ClickProps = {
  x: number;
  y: number;
  time: number;
};

export type RageClickData = {
  clickCount: number;
  clicks: ClickProps[];
  eventProperties: Record<string, any>;
};

type RageClickTracker = {
  registerClickEvent: (
    coordinates: AmpCaptureCoordinates,
    eventProperties: Record<string, any>,
  ) => (() => void) | undefined;
};

export type RageClickMobileEventProperties = {
  ['[Amplitude] Begin Time']: number;
  ['[Amplitude] End Time']: number;
  ['[Amplitude] Duration']: number;
  ['[Amplitude] Click Count']: number;
  ['[Amplitude] Clicks']: ClickProps[];
};

/**
 * Build the event properties for a `[Amplitude] Rage Click` event from the tracker's click data.
 * The element properties of the first click in the burst are merged in alongside the rage click properties.
 */
export function getRageClickEventProperties(clickData: RageClickData): Record<string, any> {
  const firstClickTime = clickData.clicks[0].time;
  const lastClickTime = clickData.clicks[clickData.clicks.length - 1].time;
  const rageClickProperties: RageClickMobileEventProperties = {
    ['[Amplitude] Begin Time']: firstClickTime,
    ['[Amplitude] End Time']: lastClickTime,
    ['[Amplitude] Duration']: lastClickTime - firstClickTime,
    ['[Amplitude] Click Count']: clickData.clickCount,
    ['[Amplitude] Clicks']: clickData.clicks,
  };
  return { ...rageClickProperties, ...clickData.eventProperties };
}

export function createRageClickTracker(rageClickHandler: (clickData: RageClickData) => void): RageClickTracker {
  let clickWindow: ClickEvent[] = [];
  let timeoutInterval: ReturnType<typeof setTimeout> | undefined;
  let firstClickEvent: ClickEvent | undefined;
  let clickCount = 0;
  // Every click in the current burst (not trimmed like clickWindow) so the event can report all of them.
  let clicks: ClickProps[] = [];
  let pendingRageClickData: RageClickData | undefined;
  let clickBoundingBox: ClickRegionBoundingBox | undefined;

  function flush() {
    if (pendingRageClickData) {
      rageClickHandler(pendingRageClickData);
      pendingRageClickData = undefined;
      timeoutInterval && clearTimeout(timeoutInterval);
    }
    clickWindow = [];
    clickCount = 0;
    clicks = [];
    firstClickEvent = undefined;
    clickBoundingBox = undefined;
  }

  /**
   * Register a click event
   * @param coordinates - The page coordinates where the click occurred
   * @returns
   */
  function registerClickEvent(coordinates: AmpCaptureCoordinates, eventProperties: Record<string, any>) {
    const now = Date.now();

    // If the click is outside of the rage click time window or 50px region, flush the window.
    const firstClickInWindow = clickWindow.length > 0 ? clickWindow[0] : null;
    const isOutsideWindow =
      firstClickInWindow && now - firstClickInWindow.clickTimestamp > DEFAULT_RAGE_CLICK_WINDOW_MS;
    const nextBoundingBox = clickBoundingBox
      ? {
          xMin: Math.min(clickBoundingBox.xMin, coordinates.x),
          xMax: Math.max(clickBoundingBox.xMax, coordinates.x),
          yMin: Math.min(clickBoundingBox.yMin, coordinates.y),
          yMax: Math.max(clickBoundingBox.yMax, coordinates.y),
        }
      : { xMin: coordinates.x, xMax: coordinates.x, yMin: coordinates.y, yMax: coordinates.y };
    const isOutsideBoundingBox =
      nextBoundingBox.xMax - nextBoundingBox.xMin > DEFAULT_RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD ||
      nextBoundingBox.yMax - nextBoundingBox.yMin > DEFAULT_RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD;
    if (isOutsideBoundingBox || isOutsideWindow) {
      flush();
    }

    const clickEvent: ClickEvent = {
      coordinates,
      clickTimestamp: now,
      eventProperties,
    };
    if (clickWindow.length === 0) {
      firstClickEvent = clickEvent;
      clickBoundingBox = {
        xMin: coordinates.x,
        xMax: coordinates.x,
        yMin: coordinates.y,
        yMax: coordinates.y,
      };
    } else {
      clickBoundingBox = nextBoundingBox;
    }

    // add this click to the window; only keep the 4 most recent clicks to save memory
    clickWindow.push(clickEvent);
    clickCount++;
    clicks.push({ x: coordinates.x, y: coordinates.y, time: now });
    if (clickWindow.length > DEFAULT_RAGE_CLICK_THRESHOLD) {
      clickWindow.shift();
    }

    // if below threshold, return
    if (clickWindow.length < DEFAULT_RAGE_CLICK_THRESHOLD) {
      return;
    }

    // we found a rage click, save the callback data for later
    pendingRageClickData = {
      clickCount,
      clicks: [...clicks],
      eventProperties: firstClickEvent?.eventProperties ?? {},
    };

    // debounce: only send the rage click once there have been no clicks for a full window
    timeoutInterval && clearTimeout(timeoutInterval);
    timeoutInterval = setTimeout(flush, DEFAULT_RAGE_CLICK_WINDOW_MS);

    return () => {
      clearTimeout(timeoutInterval);
    };
  }

  return { registerClickEvent };
}
