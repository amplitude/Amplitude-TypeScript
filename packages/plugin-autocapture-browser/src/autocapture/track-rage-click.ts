import { AllWindowObservables } from '../frustration-plugin';
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
  const { pageX, pageY } = click.event as MouseEvent;
  regionBox.yMin = Math.min(regionBox.yMin ?? pageY, pageY);
  regionBox.yMax = Math.max(regionBox.yMax ?? pageY, pageY);
  regionBox.xMin = Math.min(regionBox.xMin ?? pageX, pageX);
  regionBox.xMax = Math.max(regionBox.xMax ?? pageX, pageX);
  regionBox.isOutOfBounds =
    regionBox.yMax - regionBox.yMin > RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD ||
    regionBox.xMax - regionBox.xMin > RAGE_CLICK_OUT_OF_BOUNDS_THRESHOLD;
}

function getRageClickAnalyticsEvent(clickWindow: ClickEvent[]) {
  /* istanbul ignore if */
  if (clickWindow.length === 0) {
    return null;
  }
  const firstClick = clickWindow[0];
  const lastClick = clickWindow[clickWindow.length - 1];

  const rageClickEvent: EventRageClick = {
    '[Amplitude] Begin Time': new Date(firstClick.timestamp).toISOString(),
    '[Amplitude] End Time': new Date(lastClick.timestamp).toISOString(),
    '[Amplitude] Duration': lastClick.timestamp - firstClick.timestamp,
    '[Amplitude] Clicks': clickWindow.map((click) => ({
      X: (click.event as MouseEvent).pageX,
      Y: (click.event as MouseEvent).pageY,
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
  const { clickObservable, selectionObservable }: AllWindowObservables = allObservables;

  // Keep track of all clicks within the sliding window
  let clickWindow: ClickEvent[] = [];

  // Keep track of the region box for all clicks, to determine when a rage click is out of bounds
  let clickBoundingBox: ClickRegionBoundingBox = {};

  let pendingRageClick: {
    resolve: (rageClickEvent: RageClickEvent | null) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    timerId: any;
  } | null = null;

  // helper function to reset the click window and region box
  function resetClickWindow(click?: ClickEvent) {
    clickWindow = [];
    clickBoundingBox = {};
    if (click) {
      addCoordinates(clickBoundingBox, click);
      clickWindow.push(click);
    }
  }

  const rageClickObservable = asyncMap(
    clickObservable.filter((click) => shouldTrackRageClick('click', click.closestTrackedAncestor)),
    async (click: ClickEvent): Promise<RageClickEvent | null> => {
      // add this click's coordinates to the bounding box
      addCoordinates(clickBoundingBox, click);

      let resolutionValue: RageClickEvent | null = null;

      // if current click is:
      //  1. first click in the window
      //  2. on a new element
      //  3. outside the rage click time window
      //  4. out of bounds
      // then start a new click window
      if (
        clickWindow.length === 0 ||
        isNewElement(clickWindow, click) ||
        isClickOutsideRageClickWindow(clickWindow, click) ||
        clickBoundingBox.isOutOfBounds
      ) {
        // if there was a previous Rage Click Event on deck, then send it
        if (pendingRageClick) {
          resolutionValue = getRageClickAnalyticsEvent(clickWindow);
        }
        resetClickWindow(click);
      } else {
        clickWindow.push(click);
      }

      // if there was a previous Rage Click Event on deck, then resolve it
      if (pendingRageClick) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        clearTimeout(pendingRageClick.timerId);
        pendingRageClick.resolve(resolutionValue);
        pendingRageClick = null;
      }

      // if we have enough clicks to be a rage click, set a timout to trigger the rage
      // click event after the time threshold is reached.
      // This will be cancelled if a new click is tracked within the time threshold.
      if (clickWindow.length >= RAGE_CLICK_THRESHOLD) {
        return new Promise((resolve) => {
          pendingRageClick = {
            resolve,
            timerId: setTimeout(() => {
              resolve(getRageClickAnalyticsEvent(clickWindow));
            }, RAGE_CLICK_WINDOW_MS),
          };
        });
      }

      return null;
    },
  );

  // reset the click window when a selection change occurs
  /* istanbul ignore next */
  const selectionSubscription = selectionObservable?.subscribe(() => {
    resetClickWindow();
  });

  const rageClickSubscription = rageClickObservable.subscribe((data: RageClickEvent | null) => {
    /* istanbul ignore if */
    if (data === null) {
      return;
    }
    amplitude.track(AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT, data.rageClickEvent, { time: data.time });
  });

  return {
    unsubscribe: () => {
      rageClickSubscription.unsubscribe();
      /* istanbul ignore next */
      selectionSubscription?.unsubscribe();
    },
  };
}
