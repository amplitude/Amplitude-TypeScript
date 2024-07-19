import {
  AllWindowObservables,
  AutoCaptureOptionsWithDefaults,
  ElementBasedTimestampedEvent,
  ObservablesEnum,
} from 'src/autocapture-plugin';
import { filter, map, switchMap, takeUntil, timer, take, merge } from 'rxjs';
import { ActionType } from 'src/typings/autocapture';
import { BrowserClient } from '@amplitude/analytics-types';
import { getClosestElement, shouldTrackEvent } from '../helpers';
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
      // Filter out clickEvent events with no target
      // no event target could happen when change events are triggered programmatically
      if (!click.event.target) {
        return false;
      }

      // Filter out regularly tracked click events that are already handled in trackClicks
      return !shouldTrackEvent('click', click.event.target as Element);
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
    filter((clickEvent) => {
      // Filter out clicks with no closestTrackedAncestor according to actionClickAllowlist
      if (!clickEvent.closestTrackedAncestor) {
        return false;
      }

      // Only track change on elements that should be tracked,
      return shouldTrackActionClick('click', clickEvent.closestTrackedAncestor);
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
    // If a mutation occurs within 1 second (takeUntil(timer(1000))), it emits the original first click event.
    switchMap((click) =>
      mutationOrNavigate.pipe(
        takeUntil(timer(500)),
        map(() => click),
        take(1),
      ),
    ),
  );

  return actionClicks.subscribe((actionClick) => {
    amplitude?.track(
      AMPLITUDE_ELEMENT_CLICKED_EVENT,
      getEventProperties('click', (actionClick as ElementBasedTimestampedEvent<MouseEvent>).closestTrackedAncestor),
    );
  });
}
