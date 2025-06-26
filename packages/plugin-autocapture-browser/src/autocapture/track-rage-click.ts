import { AllWindowObservables } from 'src/autocapture-plugin';
import { filter, map, bufferTime } from 'rxjs';
import { BrowserClient } from '@amplitude/analytics-core';
import { filterOutNonTrackableEvents, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT } from '../constants';
import { DEFAULT_RAGE_CLICK_THRESHOLD, DEFAULT_RAGE_CLICK_WINDOW_MS } from '@amplitude/analytics-core';

let RAGE_CLICK_THRESHOLD = DEFAULT_RAGE_CLICK_THRESHOLD;
let RAGE_CLICK_WINDOW_MS = DEFAULT_RAGE_CLICK_WINDOW_MS;

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
      // filter if not enough clicks to be a rage click
      if (clicks.length < RAGE_CLICK_THRESHOLD) {
        return false;
      }

      // filter if the last RAGE_CLICK_THRESHOLD clicks were not all on the same element
      let trailingIndex = clicks.length - 1;
      const lastClickTarget = clicks[trailingIndex].event.target;
      while (--trailingIndex >= clicks.length - RAGE_CLICK_THRESHOLD) {
        if (clicks[trailingIndex].event.target !== lastClickTarget) {
          return false;
        }
      }

      // if we reach here that means the last RAGE_CLICK_THRESHOLD clicks were all on the same element
      // and thus we have a rage click
      return true;
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
    amplitude.track(AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT, rageClickEvent, { time });
  });
}
