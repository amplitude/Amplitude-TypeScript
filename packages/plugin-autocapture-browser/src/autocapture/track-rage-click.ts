import { AllWindowObservables } from 'src/autocapture-plugin';
import { filter, map } from 'rxjs';
import { BrowserClient } from '@amplitude/analytics-core';
import { filterOutNonTrackableEvents, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT } from '../constants';
import { DEFAULT_RAGE_CLICK_THRESHOLD, DEFAULT_RAGE_CLICK_WINDOW_MS } from '@amplitude/analytics-core';

const RAGE_CLICK_THRESHOLD = DEFAULT_RAGE_CLICK_THRESHOLD;
const RAGE_CLICK_WINDOW_MS = DEFAULT_RAGE_CLICK_WINDOW_MS;

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

type ClickEvent = {
  event: MouseEvent | Event;
  timestamp: number;
  targetElementProperties: Record<string, any>;
  closestTrackedAncestor: Element | null;
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

  // Keep track of all clicks within the sliding window
  const clickWindow: ClickEvent[] = [];

  return clickObservable
    .pipe(
      filter(filterOutNonTrackableEvents),
      filter((click) => {
        return shouldTrackRageClick('click', click.closestTrackedAncestor);
      }),
      map((click) => {
        const now = click.timestamp;

        // if the current click isn't on the same element as the most recent click,
        // clear the sliding window and start over
        if (
          clickWindow.length > 0 &&
          clickWindow[clickWindow.length - 1].closestTrackedAncestor !== click.closestTrackedAncestor
        ) {
          clickWindow.splice(0, clickWindow.length);
        }

        // remove past clicks that are outside the sliding window
        let clickPtr = 0;
        for (; clickPtr < clickWindow.length; clickPtr++) {
          if (now - clickWindow[clickPtr].timestamp < RAGE_CLICK_WINDOW_MS) {
            break;
          }
        }
        clickWindow.splice(0, clickPtr);

        // add the current click to the window
        clickWindow.push(click);

        // if there's not enough clicks to be a rage click, return null
        if (clickWindow.length < RAGE_CLICK_THRESHOLD) {
          return null;
        }

        // if we've made it here, we have enough trailing clicks on the same element
        // for it to be a rage click
        const firstClick = clickWindow[0];
        const lastClick = clickWindow[clickWindow.length - 1];

        const rageClickEvent: EventRageClick = {
          '[Amplitude] Begin Time': new Date(firstClick.timestamp).toISOString(),
          '[Amplitude] End Time': new Date(lastClick.timestamp).toISOString(),
          '[Amplitude] Duration': lastClick.timestamp - firstClick.timestamp,
          '[Amplitude] Clicks': clickWindow.map((click) => ({
            X: (click.event as MouseEvent).clientX,
            Y: (click.event as MouseEvent).clientY,
            Time: click.timestamp,
          })),
          '[Amplitude] Click Count': clickWindow.length,
          ...firstClick.targetElementProperties,
        };

        // restart the sliding window
        clickWindow.splice(0, clickWindow.length);

        return { rageClickEvent, time: firstClick.timestamp };
      }),
      filter((result) => result !== null),
    )
    .subscribe((data: { rageClickEvent: EventRageClick; time: number } | null) => {
      /* istanbul ignore if */
      if (data === null) {
        return;
      }
      amplitude.track(AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT, data.rageClickEvent, { time: data.time });
    });
}
