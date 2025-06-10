import {
  AllWindowObservables,
  AutoCaptureOptionsWithDefaults,
  ElementBasedTimestampedEvent,
  ObservablesEnum,
} from 'src/autocapture-plugin';
import { filter, map, merge, take, mergeMap, race, Observable, Subscriber } from 'rxjs';
import { BrowserClient, ActionType } from '@amplitude/analytics-core';
import { filterOutNonTrackableEvents, getClosestElement, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_DEAD_CLICKED_EVENT } from '../constants';

const DEAD_CLICK_TIMEOUT = 3000; // 3 seconds to wait for an activity to happen

export function trackDeadClick({
  amplitude,
  allObservables,
  options,
  getEventProperties,
  shouldTrackDeadClick,
}: {
  amplitude: BrowserClient;
  allObservables: AllWindowObservables;
  options: AutoCaptureOptionsWithDefaults;
  getEventProperties: (actionType: ActionType, element: Element) => Record<string, any>;
  shouldTrackDeadClick: shouldTrackEvent;
}) {
  const { clickObservable, mutationObservable, navigateObservable } = allObservables;

  const filteredClickObservable = clickObservable.pipe(
    map((click) => {
      // overwrite the closestTrackedAncestor with the closest element that is on the actionClickAllowlist
      const closestActionClickEl = getClosestElement(click.event.target as Element, options.deadClickAllowlist);
      click.closestTrackedAncestor = closestActionClickEl as Element;

      // overwrite the targetElementProperties with the properties of the closestActionClickEl
      if (click.closestTrackedAncestor !== null) {
        click.targetElementProperties = getEventProperties(click.type, click.closestTrackedAncestor);
      }
      return click;
    }),
    filter(filterOutNonTrackableEvents),
    filter((clickEvent) => {
      // Only track change on elements that should be tracked
      return shouldTrackDeadClick('click', clickEvent.closestTrackedAncestor);
    }),
  );

  const changeObservables: Array<
    AllWindowObservables[ObservablesEnum.MutationObservable] | AllWindowObservables[ObservablesEnum.NavigateObservable]
  > = [mutationObservable];
  /* istanbul ignore next */
  if (navigateObservable) {
    changeObservables.push(navigateObservable);
  }
  const mutationOrNavigate = merge(...changeObservables);

  const actionClicks = filteredClickObservable.pipe(
    mergeMap((click) => {
      // Create a timer that emits after 500ms
      const timer = new Observable<typeof click>((subscriber: Subscriber<typeof click>) => {
        setTimeout(() => subscriber.next(click), DEAD_CLICK_TIMEOUT);
      });

      // Race between the timer and any mutations/navigation
      return race(
        timer,
        mutationOrNavigate.pipe(
          take(1),
          map(() => null),
        ),
      ).pipe(
        // Only emit if the timer won (meaning no mutations occurred)
        filter((value): value is ElementBasedTimestampedEvent<MouseEvent> => value !== null),
      );
    }),
  );

  return actionClicks.subscribe((actionClick) => {
    /* istanbul ignore next */
    amplitude?.track(AMPLITUDE_ELEMENT_DEAD_CLICKED_EVENT, {
      ...getEventProperties('click', (actionClick ).closestTrackedAncestor),
      isDeadClick: true,
    });
  });
}
