import { AllWindowObservables, AutoCaptureOptionsWithDefaults } from 'src/autocapture-plugin';
import { BrowserClient, ActionType, merge, asyncMap } from '@amplitude/analytics-core';
import {
  ElementBasedTimestampedEvent,
  filterOutNonTrackableEvents,
  getClosestElement,
  shouldTrackEvent,
  TimestampedEvent,
} from '../helpers';
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
  const { clickObservableZen, mutationObservableZen, navigateObservableZen } = allObservables;

  // TODO: remove this once we're ready for ZenObservable and they become not optional
  /* istanbul ignore if */
  if (!clickObservableZen || !mutationObservableZen) {
    return;
  }

  const filteredClickObservable = clickObservableZen
    .filter((click) => {
      return !shouldTrackEvent('click', click.closestTrackedAncestor);
    })
    .map((click) => {
      // overwrite the closestTrackedAncestor with the closest element that is on the actionClickAllowlist
      const closestActionClickEl = getClosestElement(click.event.target as Element, options.actionClickAllowlist);
      click.closestTrackedAncestor = closestActionClickEl as Element;

      // overwrite the targetElementProperties with the properties of the closestActionClickEl
      if (click.closestTrackedAncestor !== null) {
        click.targetElementProperties = getEventProperties(click.type, click.closestTrackedAncestor);
      }
      return click;
    })
    .filter(filterOutNonTrackableEvents)
    .filter((clickEvent) => {
      // Only track change on elements that should be tracked
      return shouldTrackActionClick('click', clickEvent.closestTrackedAncestor);
    });

  let mutationOrNavigate = navigateObservableZen
    ? merge(mutationObservableZen, navigateObservableZen)
    : mutationObservableZen;
  mutationOrNavigate = asyncMap(mutationOrNavigate, (event) => {
    // defer mutation/navigation events to new task to prevent
    // from being emitted before the click event
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(event);
      }, 0);
    });
  });

  const clickMutationNavigateObservable = merge(filteredClickObservable, mutationOrNavigate);

  let actionClickTimer: ReturnType<typeof setTimeout> | null = null;
  let lastClickEvent: TimestampedEvent<any> | null = null;

  const actionClickObservable = asyncMap(clickMutationNavigateObservable, (event): any => {
    // clear any previous timer
    if (actionClickTimer) {
      clearTimeout(actionClickTimer);
      actionClickTimer = null;
    }
    if (event.type === 'click') {
      // mark the 'last click event'
      lastClickEvent = event;

      // set a timer to clear last click event if no mutation event between now and 500ms
      actionClickTimer = setTimeout(() => {
        actionClickTimer = null;
        lastClickEvent = null;
        return null;
      }, 500);
      return Promise.resolve(null);
    } else {
      // if mutation/navigation + last click event, then it's an action click
      if (lastClickEvent) {
        try {
          return Promise.resolve(lastClickEvent);
        } finally {
          lastClickEvent = null;
        }
      }
    }
    return Promise.resolve(null);
  });

  return actionClickObservable.subscribe((actionClick: any) => {
    if (!actionClick) return;
    /* istanbul ignore next */
    amplitude?.track(
      AMPLITUDE_ELEMENT_CLICKED_EVENT,
      getEventProperties('click', (actionClick as ElementBasedTimestampedEvent<MouseEvent>).closestTrackedAncestor),
    );
  });
}
