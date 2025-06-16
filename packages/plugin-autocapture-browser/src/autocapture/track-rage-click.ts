import { AllWindowObservables } from 'src/autocapture-plugin';
import { filter, map, bufferTime } from 'rxjs';
import { BrowserClient } from '@amplitude/analytics-core';
import { filterOutNonTrackableEvents, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT } from '../constants';

const RAGE_CLICK_THRESHOLD = 5;
const RAGE_CLICK_WINDOW_MS = 3000; // 3 seconds

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

      // it is only a rage click if the last RAGE_CLICK_THRESHOLD clicks are on the same element
      const lastClickTarget = clicks[clicks.length - 1].event.target;
      const trailingClicks = clicks
        .slice()
        .reverse()
        .filter((click) => click.event.target === lastClickTarget)
        .reverse();

      return trailingClicks.length >= RAGE_CLICK_THRESHOLD;
    }),
    map((clicks) => {
      const firstClick = clicks[0];
      const lastClick = clicks[clicks.length - 1];
      const beginTimeISO = new Date(firstClick.timestamp).toISOString();
      const endTimeISO = new Date(lastClick.timestamp).toISOString();
      const rageClickEvent: EventRageClick = {
        '[Amplitude] Begin Time': beginTimeISO,
        '[Amplitude] End Time': endTimeISO,
        '[Amplitude] Duration': clicks[clicks.length - 1].timestamp - firstClick.timestamp,
        '[Amplitude] Clicks': clicks.map((click) => ({
          X: (click.event as MouseEvent).clientX,
          Y: (click.event as MouseEvent).clientY,
          Time: click.timestamp,
        })),
        '[Amplitude] Click Count': clicks.length,
        ...firstClick.targetElementProperties,
      };
      return { rageClickEvent, timestamp: firstClick.timestamp };
    }),
  );

  return rageClickObservable.subscribe(({ rageClickEvent, timestamp }) => {
    amplitude?.track(AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT, rageClickEvent, { time: timestamp });
  });
}
