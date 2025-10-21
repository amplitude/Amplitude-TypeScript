import { AllWindowObservables } from 'src/autocapture-plugin';
import {
  BrowserClient,
  asyncMap,
  DEFAULT_RAGE_CLICK_THRESHOLD,
  DEFAULT_RAGE_CLICK_WINDOW_MS,
  DEFAULT_RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD,
} from '@amplitude/analytics-core';
import { shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT } from '../constants';

const RAGE_CLICK_THRESHOLD = DEFAULT_RAGE_CLICK_THRESHOLD;
const RAGE_CLICK_WINDOW_MS = DEFAULT_RAGE_CLICK_WINDOW_MS;
const RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD = DEFAULT_RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD;

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

type ClickRegionBoundingBox = {
  yMin?: number;
  yMax?: number;
  xMin?: number;
  xMax?: number;
  isOutOfBounds?: boolean;
};

type RageClickEvent = {
  rageClickEvent: EventRageClick;
  time: number;
};

function addCoordinates(regionBox: ClickRegionBoundingBox, click: ClickEvent) {
  const { clientX, clientY } = click.event as MouseEvent;
  regionBox.yMin = Math.min(regionBox.yMin ?? clientY, clientY);
  regionBox.yMax = Math.max(regionBox.yMax ?? clientY, clientY);
  regionBox.xMin = Math.min(regionBox.xMin ?? clientX, clientX);
  regionBox.xMax = Math.max(regionBox.xMax ?? clientX, clientX);
  regionBox.isOutOfBounds =
    regionBox.yMax - regionBox.yMin > RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD ||
    regionBox.xMax - regionBox.xMin > RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD;
}

function getRageClickAnalyticsEvent(clickWindow: ClickEvent[]) {
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
  const { clickObservableZen } = allObservables;

  // TODO: take this out once it becomes a non-optional parameter
  if (!clickObservableZen) {
    return;
  }

  // Keep track of all clicks within the sliding window
  let clickWindow: ClickEvent[] = [];

  // Keep track of the region box for all clicks, to determine when a rage click is out of bounds
  let clickBoundingBox: ClickRegionBoundingBox = {};

  let triggerRageClickTimeout: {
    resolve: (value: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timerId: any;
  };

  // helper function to reset the click window and region box
  function resetClickWindow(click?: ClickEvent) {
    clickWindow = [];
    clickBoundingBox = {};
    if (click) {
      addCoordinates(clickBoundingBox, click);
      clickWindow.push(click);
    }
  }

  clickObservableZen.filter((click) => shouldTrackRageClick('click', click.closestTrackedAncestor));

  const rageClickObservable = asyncMap(
    clickObservableZen,
    async (click: ClickEvent): Promise<RageClickEvent | null> => {
      // if there was a previous rage click timeout, clear it
      if (triggerRageClickTimeout) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        clearTimeout(triggerRageClickTimeout.timerId);
        triggerRageClickTimeout.resolve(null);
      }

      // add click to bounding box
      addCoordinates(clickBoundingBox, click);

      // if there's just one click in the window, add it to clickWindow and return
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
        clickBoundingBox.isOutOfBounds
      ) {
        resetClickWindow(click);
        return null;
      }

      // add click to current window
      clickWindow.push(click);

      // if we have enough clicks to be a rage click, set a timout to trigger the rage
      // click event after the time threshold is reached.
      // This will be cancelled if a new click is tracked within the time threshold.
      if (clickWindow.length >= RAGE_CLICK_THRESHOLD) {
        return new Promise((resolve) => {
          triggerRageClickTimeout = {
            resolve,
            timerId: setTimeout(() => {
              const data = getRageClickAnalyticsEvent(clickWindow);
              resetClickWindow();
              resolve(data);
            }, RAGE_CLICK_WINDOW_MS),
          };
        });
      }

      return null;
    },
  );

  return rageClickObservable
    .filter((result) => result !== null)
    .subscribe((data: RageClickEvent) => {
      amplitude.track(AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT, data.rageClickEvent, { time: data.time });
    });
}
