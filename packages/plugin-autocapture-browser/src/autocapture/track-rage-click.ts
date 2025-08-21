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

function getRageClickEvent(clickWindow: ClickEvent[]) {
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
}

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
  let clickWindow: ClickEvent[] = [];
  let clickWaitTimer: string | number | undefined;

  return clickObservable
    .pipe(
      filter(filterOutNonTrackableEvents),
      filter((click) => {
        return shouldTrackRageClick('click', click.closestTrackedAncestor);
      }),
      map((click) => {
        let isRageClickPeriodComplete = false;

        // reset the click wait timer
        if (clickWaitTimer) {
          clearTimeout(clickWaitTimer);
        }

        // if the current click isn't on the same element as the most recent click,
        // start a new sliding window
        if (
          clickWindow.length > 0 &&
          clickWindow[clickWindow.length - 1].closestTrackedAncestor !== click.closestTrackedAncestor
          // TODO: add region check here
        ) {
          if (clickWindow.length >= RAGE_CLICK_THRESHOLD) {
            isRageClickPeriodComplete = true;
            const rageClickEvent = getRageClickEvent(clickWindow);
            clickWindow = [click];
            return rageClickEvent;
          } else {
            clickWindow = [click];
            return null;
          }
        } else {
          clickWindow.push(click);

          // if the last click is not within the rage click time window,
          // rage click period is over
          if (clickWindow.length > RAGE_CLICK_THRESHOLD) {
            const lastClick = clickWindow[clickWindow.length - 1];
            const firstClick = clickWindow[clickWindow.length - RAGE_CLICK_THRESHOLD];
            if (lastClick.timestamp - firstClick.timestamp >= RAGE_CLICK_WINDOW_MS) {
              isRageClickPeriodComplete = true;

              // remove last click from current click window, move it to next click window
              const rageClickEvent = getRageClickEvent(clickWindow.slice(0, clickWindow.length - 1));
              clickWindow = [click];
              return rageClickEvent;
            }
          }
        }

        // if we have enough clicks to be a rage click, but the rage click period is not complete,
        // set a timer to trigger the rage click event if the rage click period is not complete
        if (!isRageClickPeriodComplete && clickWindow.length >= RAGE_CLICK_THRESHOLD) {
          clickWaitTimer = setTimeout(() => {
            const { rageClickEvent, time } = getRageClickEvent(clickWindow);
            amplitude.track(AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT, rageClickEvent, { time });
            clickWindow = [];
          }, RAGE_CLICK_WINDOW_MS);
        }

        return null;
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
