import { AllWindowObservables, type evaluateTriggersFn } from 'src/autocapture-plugin';
import { filter, map } from 'rxjs';
import { BrowserClient, ActionType } from '@amplitude/analytics-core';
import { filterOutNonTrackableEvents, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_CHANGED_EVENT } from '../constants';

export function trackChange({
  amplitude,
  allObservables,
  getEventProperties,
  shouldTrackEvent,
  evaluateTriggers,
}: {
  amplitude: BrowserClient;
  allObservables: AllWindowObservables;
  getEventProperties: (actionType: ActionType, element: Element) => Record<string, any>;
  shouldTrackEvent: shouldTrackEvent;
  evaluateTriggers: evaluateTriggersFn;
}) {
  const { changeObservable } = allObservables;

  const filteredChangeObservable = changeObservable.pipe(
    filter(filterOutNonTrackableEvents),
    filter((changeEvent) => {
      // Only track change on elements that should be tracked,
      return shouldTrackEvent('change', changeEvent.closestTrackedAncestor);
    }),
    map((changeEvent) => evaluateTriggers(changeEvent)),
  );

  return filteredChangeObservable.subscribe((changeEvent) => {
    /* istanbul ignore next */
    amplitude?.track(AMPLITUDE_ELEMENT_CHANGED_EVENT, getEventProperties('change', changeEvent.closestTrackedAncestor));
  });
}
