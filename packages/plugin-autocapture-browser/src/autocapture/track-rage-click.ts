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

  return { rageClickEvent, time: firstClick.timestamp };
}

function isClickOutsideRageClickWindow(click: ClickEvent, clickWindow: ClickEvent[]) {
  if (clickWindow.length > RAGE_CLICK_THRESHOLD - 1) {
    const firstClick = clickWindow[clickWindow.length - RAGE_CLICK_THRESHOLD + 1];
    if (click.timestamp - firstClick.timestamp >= RAGE_CLICK_WINDOW_MS) {
      return true;
    }
  }
  return false;
}

function isNewElement(clickWindow: ClickEvent[], click: ClickEvent) {
  return (
    clickWindow.length > 0 &&
    clickWindow[clickWindow.length - 1].closestTrackedAncestor !== click.closestTrackedAncestor
  );
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let triggerRageClickTimeout: any;

  return clickObservable
    .pipe(
      filter(filterOutNonTrackableEvents),
      filter((click) => {
        return shouldTrackRageClick('click', click.closestTrackedAncestor);
      }),
      map((click) => {
        // reset the click wait timer if it exists
        if (triggerRageClickTimeout) {
          clearTimeout(triggerRageClickTimeout);
        }

        // if the current click isn't on the same element as the most recent click,
        // start a new sliding window
        // TODO: add isNewRegion check here
        if (isNewElement(clickWindow, click)) {
          let returnValue = null;
          if (clickWindow.length >= RAGE_CLICK_THRESHOLD) {
            returnValue = getRageClickEvent(clickWindow);
          }
          clickWindow = [click];
          return returnValue;
        }


        // if the last click is not within the rage click time window,
        // rage click period is over
        if (isClickOutsideRageClickWindow(click, clickWindow)) {
          // remove last click from current click window, move it to next click window
          const rageClickEvent = getRageClickEvent(clickWindow);
          clickWindow = [click];
          return rageClickEvent;
        }

        // add click to current window
        clickWindow.push(click);

        // if we have enough clicks to be a rage click, but the rage click period is not complete,
        // set a timer to trigger the rage click event after the time threshold is reached
        if (clickWindow.length >= RAGE_CLICK_THRESHOLD) {
          triggerRageClickTimeout = setTimeout(() => {
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
