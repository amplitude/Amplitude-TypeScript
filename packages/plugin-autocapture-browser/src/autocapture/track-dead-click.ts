import { AllWindowObservables } from 'src/autocapture-plugin';
import { BrowserClient, ActionType, merge, asyncMap } from '@amplitude/analytics-core';
import { ElementBasedTimestampedEvent, filterOutNonTrackableEvents, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_DEAD_CLICKED_EVENT } from '../constants';
const DEAD_CLICK_TIMEOUT = 3000; // 3 seconds to wait for an activity to happen

type EventDeadClick = {
  '[Amplitude] X': number;
  '[Amplitude] Y': number;
};

export function trackDeadClick({
  amplitude,
  allObservables,
  getEventProperties,
  shouldTrackDeadClick,
}: {
  amplitude: BrowserClient;
  allObservables: AllWindowObservables;
  getEventProperties: (actionType: ActionType, element: Element) => Record<string, any>;
  shouldTrackDeadClick: shouldTrackEvent;
}) {
  const { clickObservableZen, mutationObservableZen, navigateObservableZen } = allObservables;

  /* istanbul ignore if */
  if (!clickObservableZen || !mutationObservableZen || !navigateObservableZen) {
    return;
  }

  const filteredClickObservable = clickObservableZen.filter((click) => {
    return (
      filterOutNonTrackableEvents(click) &&
      shouldTrackDeadClick('click', click.closestTrackedAncestor) &&
      click.event.target instanceof Element &&
      click.event.target.closest('a[target="_blank"]') === null
    );
  });

  const clicksAndMutationsObservable = merge(
    merge(filteredClickObservable, mutationObservableZen),
    navigateObservableZen,
  );

  let deadClickTimer: NodeJS.Timeout | null = null;

  const deadClickObservable = asyncMap(
    clicksAndMutationsObservable,
    (event): Promise<ElementBasedTimestampedEvent<MouseEvent> | null> => {
      if (deadClickTimer && ['mutation', 'navigate'].includes(event.type)) {
        clearTimeout(deadClickTimer);
        deadClickTimer = null;
        return Promise.resolve(null);
      } else if (event.type === 'click') {
        // if a dead click is on-deck, return null. This is to throttle dead click events.
        if (deadClickTimer) {
          return Promise.resolve(null);
        }
        return new Promise((resolve) => {
          deadClickTimer = setTimeout(() => {
            resolve(event as ElementBasedTimestampedEvent<MouseEvent>);
            deadClickTimer = null;
          }, DEAD_CLICK_TIMEOUT);
        });
      }
      return Promise.resolve(null);
    },
  );

  return deadClickObservable.subscribe((actionClick) => {
    if (!actionClick) return;
    const deadClickEvent: EventDeadClick = {
      '[Amplitude] X': (actionClick.event as MouseEvent).clientX,
      '[Amplitude] Y': (actionClick.event as MouseEvent).clientY,
    };
    amplitude.track(
      AMPLITUDE_ELEMENT_DEAD_CLICKED_EVENT,
      {
        ...getEventProperties('click', actionClick.closestTrackedAncestor),
        ...deadClickEvent,
      },
      { time: actionClick.timestamp },
    );
  });
}
