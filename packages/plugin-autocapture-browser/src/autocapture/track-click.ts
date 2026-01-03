import { AllWindowObservables } from '../autocapture-plugin';
import { ElementBasedEvent, ElementBasedTimestampedEvent, type evaluateTriggersFn } from '../helpers';
import { Observable, BrowserClient } from '@amplitude/analytics-core';
import { filterOutNonTrackableEvents, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_CLICKED_EVENT } from '../constants';

export function trackClicks({
  amplitude,
  allObservables,
  shouldTrackEvent,
  evaluateTriggers,
}: {
  amplitude: BrowserClient;
  allObservables: AllWindowObservables;
  shouldTrackEvent: shouldTrackEvent;
  evaluateTriggers: evaluateTriggersFn;
}) {
  const { clickObservable } = allObservables;

  const clickObservableFiltered = clickObservable
    .filter(filterOutNonTrackableEvents)
    .filter((click) => {
      // Only track clicks on elements that should be tracked,
      return shouldTrackEvent('click', click.closestTrackedAncestor);
    })
    .map((click) => evaluateTriggers(click));

  const clicks: Observable<typeof clickObservableFiltered extends Observable<infer U> ? U : never> =
    clickObservableFiltered;

  return clicks.subscribe((click: ElementBasedTimestampedEvent<ElementBasedEvent>) => {
    /* istanbul ignore next */
    amplitude?.track(AMPLITUDE_ELEMENT_CLICKED_EVENT, click.targetElementProperties);
  });
}
