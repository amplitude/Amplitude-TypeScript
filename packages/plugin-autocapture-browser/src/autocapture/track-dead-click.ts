import { AllWindowObservables, ObservablesEnum } from 'src/autocapture-plugin';
import { filter, map, merge, take, mergeMap, race, Observable, Subscriber, throttleTime } from 'rxjs';
import { BrowserClient, ActionType } from '@amplitude/analytics-core';
import { ElementBasedTimestampedEvent, filterOutNonTrackableEvents, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_DEAD_CLICKED_EVENT } from '../constants';

let DEAD_CLICK_TIMEOUT = 3000; // 3 seconds to wait for an activity to happen

// allow override of dead click config for testing only
export function _overrideDeadClickConfig(deadClickTimeout: number) {
  DEAD_CLICK_TIMEOUT = deadClickTimeout;
}

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
  const { clickObservable, mutationObservable, navigateObservable } = allObservables;

  const filteredClickObservable = clickObservable.pipe(
    filter(filterOutNonTrackableEvents),
    filter((clickEvent) => {
      // Only track change on elements that should be tracked
      return shouldTrackDeadClick('click', clickEvent.closestTrackedAncestor);
    }),
  );

  const changeObservables: Array<
    AllWindowObservables[ObservablesEnum.MutationObservable] | AllWindowObservables[ObservablesEnum.NavigateObservable]
  > = [mutationObservable];
  if (navigateObservable) {
    changeObservables.push(navigateObservable);
  }
  const mutationOrNavigate = merge(...changeObservables);

  const actionClicks = filteredClickObservable.pipe(
    mergeMap((click) => {
      // Create a timer that emits after 500ms
      let timeoutId: ReturnType<typeof setTimeout>;
      const timer = new Observable<typeof click>((subscriber: Subscriber<typeof click>) => {
        timeoutId = setTimeout(() => subscriber.next(click), DEAD_CLICK_TIMEOUT);

        return () => {
          clearTimeout(timeoutId);
        };
      });

      // Race between the timer and any mutations/navigation
      // if the timer wins, the click is dead so we emit it
      return race(
        timer,
        mutationOrNavigate.pipe(
          take(1),
          map(() => null),
        ),
      ).pipe(filter((value): value is ElementBasedTimestampedEvent<MouseEvent> => value !== null));
    }),
    // Only allow one dead click event every 3 seconds
    throttleTime(DEAD_CLICK_TIMEOUT),
  );

  return actionClicks.subscribe((actionClick) => {
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
