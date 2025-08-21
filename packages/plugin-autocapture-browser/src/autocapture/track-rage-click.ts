import { AllWindowObservables } from 'src/autocapture-plugin';
import { filter, map } from 'rxjs';
import { BrowserClient } from '@amplitude/analytics-core';
import { filterOutNonTrackableEvents, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT } from '../constants';
import { DEFAULT_RAGE_CLICK_THRESHOLD, DEFAULT_RAGE_CLICK_WINDOW_MS } from '@amplitude/analytics-core';

const RAGE_CLICK_THRESHOLD = DEFAULT_RAGE_CLICK_THRESHOLD;
const RAGE_CLICK_WINDOW_MS = DEFAULT_RAGE_CLICK_WINDOW_MS;
const RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD = 50; // pixels

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

type RegionBox = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  isOutOfBounds?: boolean;
};

function addCoordinates(regionBox: RegionBox, click: ClickEvent) {
  const { clientX, clientY } = click.event as MouseEvent;
  if (regionBox.top === undefined || clientY > regionBox.top) {
    regionBox.top = clientY;
  }
  if (regionBox.bottom === undefined || clientY < regionBox.bottom) {
    regionBox.bottom = clientY;
  }
  if (regionBox.left === undefined || clientX < regionBox.left) {
    regionBox.left = clientX;
  }
  if (regionBox.right === undefined || clientX > regionBox.right) {
    regionBox.right = clientX;
  }
  regionBox.isOutOfBounds =
    regionBox.top - regionBox.bottom > RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD ||
    regionBox.right - regionBox.left > RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD;
}

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

function isClickOutsideRageClickWindow(clickWindow: ClickEvent[], click: ClickEvent) {
  const firstIndex = Math.max(0, clickWindow.length - RAGE_CLICK_THRESHOLD + 1);
  const firstClick = clickWindow[firstIndex];
  return click.timestamp - firstClick.timestamp >= RAGE_CLICK_WINDOW_MS;
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

  let regionBox: RegionBox = {};

  // Keep track of all clicks within the sliding window
  let clickWindow: ClickEvent[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let triggerRageClickTimeout: any;

  function resetClickWindow(click?: ClickEvent) {
    clickWindow = [];
    regionBox = {};
    if (click) {
      addCoordinates(regionBox, click);
      clickWindow.push(click);
    }
  }

  return clickObservable
    .pipe(
      filter(filterOutNonTrackableEvents),
      filter((click) => {
        return shouldTrackRageClick('click', click.closestTrackedAncestor);
      }),
      map((click) => {
        // reset the click wait timer if it exists
        if (triggerRageClickTimeout) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          clearTimeout(triggerRageClickTimeout);
        }

        // add click to region box
        addCoordinates(regionBox, click);

        // if there's just one click in the window, add it and return
        if (clickWindow.length === 0) {
          clickWindow.push(click);
          return null;
        }

        // if current click is:
        //  1. outside the rage click window
        //  2. on a new element
        //  3. out of bounds
        // then start a new click window
        if (
          isNewElement(clickWindow, click) ||
          isClickOutsideRageClickWindow(clickWindow, click) ||
          regionBox.isOutOfBounds
        ) {
          const returnValue = clickWindow.length >= RAGE_CLICK_THRESHOLD ? getRageClickEvent(clickWindow) : null;
          resetClickWindow(click);
          return returnValue;
        }

        // add click to current window
        clickWindow.push(click);

        // if we have enough clicks to be a rage click, set a timout to trigger the rage
        // click event after the time threshold is reached.
        // Setting timeout so there's still a chance to capture more clicks within window
        if (clickWindow.length >= RAGE_CLICK_THRESHOLD) {
          triggerRageClickTimeout = setTimeout(() => {
            const { rageClickEvent, time } = getRageClickEvent(clickWindow);
            amplitude.track(AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT, rageClickEvent, { time });
            resetClickWindow();
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
