import { AllWindowObservables } from 'src/autocapture-plugin';
import { filter, map, bufferTime } from 'rxjs';
import { BrowserClient } from '@amplitude/analytics-core';
import { filterOutNonTrackableEvents, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT } from '../constants';

let RAGE_CLICK_THRESHOLD = 5;
let RAGE_CLICK_WINDOW_MS = 3000; // 3 seconds

// allow override of rage click config for testing only
export function _overrideRageClickConfig(rageClickThreshold: number, rageClickWindowMs: number) {
  RAGE_CLICK_THRESHOLD = rageClickThreshold;
  RAGE_CLICK_WINDOW_MS = rageClickWindowMs;
}

type Click = {
  X: number;
  Y: number;
  Time: number;
};

type EventRageClick = {
  '[Amplitude] Begin Time': string; // ISO-8601
  '[Amplitude] End Time': string; // ISO-8601
  '[Amplitude] Duration': number;
  '[Amplitude] Clicks': Array<Click>;
  '[Amplitude] Click Count': number;
};

export function trackRageClicks({
  amplitude,
  allObservables,
  shouldTrackRageClick,
}: {
  amplitude: BrowserClient;
  allObservables: AllWindowObservables;
  shouldTrackRageClick: shouldTrackEvent;
}) {
  const { clickObservable } = allObservables;

  // Buffer clicks within a RAGE_CLICK_WINDOW_MS window and filter for rage clicks
  const rageClickObservable = clickObservable.pipe(
    filter(filterOutNonTrackableEvents),
    filter((click) => {
      return shouldTrackRageClick('click', click.closestTrackedAncestor);
    }),
    bufferTime(RAGE_CLICK_WINDOW_MS),
    filter((clicks) => {
      if (clicks.length < RAGE_CLICK_THRESHOLD) {
        return false;
      }

      // look backwards in the buffer to see if the last n (RAGE_CLICK_THRESHOLD)
      // clicks are on the same element
      const lastClickTarget = clicks[clicks.length - 1].event.target;
      let trailingClickCount = 0;
      do {
        trailingClickCount++;
      } while (
        trailingClickCount < RAGE_CLICK_THRESHOLD &&
        clicks[clicks.length - trailingClickCount - 1].event.target === lastClickTarget
      );
      return trailingClickCount >= RAGE_CLICK_THRESHOLD;
    }),
    map((clicks) => {
      const firstClick = clicks[0];
      const lastClick = clicks[clicks.length - 1];
      const rageClickEvent: EventRageClick = {
        '[Amplitude] Begin Time': new Date(firstClick.timestamp).toISOString(),
        '[Amplitude] End Time': new Date(lastClick.timestamp).toISOString(),
        '[Amplitude] Duration': lastClick.timestamp - firstClick.timestamp,
        '[Amplitude] Clicks': clicks.map((click) => ({
          X: (click.event as MouseEvent).clientX,
          Y: (click.event as MouseEvent).clientY,
          Time: click.timestamp,
        })),
        '[Amplitude] Click Count': clicks.length,
        ...firstClick.targetElementProperties,
      };
      return { rageClickEvent, time: firstClick.timestamp };
    }),
  );

  return rageClickObservable.subscribe(({ rageClickEvent, time }) => {
    /* istanbul ignore next */
    amplitude?.track(AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT, rageClickEvent, { time });
  });
}
