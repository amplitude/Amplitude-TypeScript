import { AllWindowObservables } from 'src/autocapture-plugin';
import { filter } from 'rxjs';
import { BrowserClient, ActionType } from '@amplitude/analytics-core';
import { filterOutNonTrackableEvents, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_CHANGED_EVENT } from '../constants';

export function trackChange({
  amplitude,
  allObservables,
  getEventProperties,
  shouldTrackEvent,
}: {
  amplitude: BrowserClient;
  allObservables: AllWindowObservables;
  getEventProperties: (actionType: ActionType, element: Element) => Record<string, any>;
  shouldTrackEvent: shouldTrackEvent;
}) {
  const { changeObservable } = allObservables;

  const filteredChangeObservable = changeObservable.pipe(
    filter(filterOutNonTrackableEvents),
    filter((changeEvent) => {
      // Only track change on elements that should be tracked,
      return shouldTrackEvent('change', changeEvent.closestTrackedAncestor);
    }),
  );

  return filteredChangeObservable.subscribe((changeEvent) => {
    /* istanbul ignore next */
    amplitude?.track(AMPLITUDE_ELEMENT_CHANGED_EVENT, getEventProperties('change', changeEvent.closestTrackedAncestor));
  });
}
