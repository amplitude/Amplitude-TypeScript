import { AllWindowObservables } from '../frustration-plugin';
import { BrowserClient, ActionType, merge, asyncMap } from '@amplitude/analytics-core';
import { ElementBasedTimestampedEvent, filterOutNonTrackableEvents, MouseButton, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_DEAD_CLICKED_EVENT } from '../constants';
const DEAD_CLICK_TIMEOUT = 3000; // 3 seconds to wait for an activity to happen

type EventDeadClick = {
  '[Amplitude] X': number;
  '[Amplitude] Y': number;
};

const CHANGE_EVENTS = ['mutation', 'navigate'];

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
  const { clickObservable, mutationObservable, navigateObservable }: AllWindowObservables = allObservables;

  const filteredClickObservable = clickObservable.filter((click) => {
    return (
      filterOutNonTrackableEvents(click) &&
      shouldTrackDeadClick('click', click.closestTrackedAncestor) &&
      click.event.target instanceof Element &&
      click.event.target.closest('a[target="_blank"]') === null &&
      click.event.button === MouseButton.LEFT_OR_TOUCH_CONTACT
    );
  });

  /* istanbul ignore next */
  const changeObservables = navigateObservable ? merge(mutationObservable, navigateObservable) : mutationObservable;

  const clicksAndChangeObservable = merge(filteredClickObservable, changeObservables);

  let deadClickTimer: ReturnType<typeof setTimeout> | null = null;

  const deadClickObservable = asyncMap(
    clicksAndChangeObservable,
    (event): Promise<ElementBasedTimestampedEvent<MouseEvent> | null> => {
      if (deadClickTimer && CHANGE_EVENTS.includes(event.type)) {
        // a mutation or navigation means it's not a dead click, so clear the timer
        clearTimeout(deadClickTimer);
        deadClickTimer = null;
        return Promise.resolve(null);
      } else if (event.type === 'click') {
        // if a dead click is already on-deck, return null.
        // this throttles dead clicks events so no more than one dead click event
        // is tracked per every DEAD_CLICK_TIMEOUT ms.
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
      // unreachable code, but needed to satisfy the type checker
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
