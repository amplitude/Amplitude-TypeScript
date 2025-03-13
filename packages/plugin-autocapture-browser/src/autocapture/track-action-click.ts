import {
  AllWindowObservables,
  AutoCaptureOptionsWithDefaults,
  ElementBasedTimestampedEvent,
  ObservablesEnum,
} from 'src/autocapture-plugin';
import { filter, map, merge, switchMap, take, timeout, EMPTY } from 'rxjs';
import { BrowserClient, ActionType } from '@amplitude/analytics-core';
import { filterOutNonTrackableEvents, getClosestElement, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_CLICKED_EVENT } from '../constants';

export function trackActionClick({
  amplitude,
  allObservables,
  options,
  getEventProperties,
  shouldTrackEvent,
  shouldTrackActionClick,
}: {
  amplitude: BrowserClient;
  allObservables: AllWindowObservables;
  options: AutoCaptureOptionsWithDefaults;
  getEventProperties: (actionType: ActionType, element: Element) => Record<string, any>;
  shouldTrackActionClick: shouldTrackEvent;
  shouldTrackEvent: shouldTrackEvent;
}) {
  const { clickObservable, mutationObservable, navigateObservable } = allObservables;

  const filteredClickObservable = clickObservable.pipe(
    filter((click) => {
      // Filter out regularly tracked click events that are already handled in trackClicks
      return !shouldTrackEvent('click', click.closestTrackedAncestor);
    }),
    map((click) => {
      // overwrite the closestTrackedAncestor with the closest element that is on the actionClickAllowlist
      const closestActionClickEl = getClosestElement(click.event.target as Element, options.actionClickAllowlist);
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
      return shouldTrackActionClick('click', clickEvent.closestTrackedAncestor);
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
    // If a mutation occurs within 0.5 seconds of a click event (timeout({ first: 500 })), it emits the original first click event.
    // take 1 to only limit the action events in case there are multiple
    switchMap((click) =>
      mutationOrNavigate.pipe(
        take(1),
        timeout({ first: 500, with: () => EMPTY }), // in case of timeout, map to empty to prevent any click from being emitted
        map(() => click),
      ),
    ),
  );

  return actionClicks.subscribe((actionClick) => {
    /* istanbul ignore next */
    amplitude?.track(
      AMPLITUDE_ELEMENT_CLICKED_EVENT,
      getEventProperties('click', (actionClick as ElementBasedTimestampedEvent<MouseEvent>).closestTrackedAncestor),
    );
  });
}
