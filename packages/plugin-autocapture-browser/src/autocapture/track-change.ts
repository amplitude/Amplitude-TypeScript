import { AllWindowObservables, AutoCaptureOptionsWithDefaults } from 'src/autocapture-plugin';
import { filter } from 'rxjs';
import { ActionType } from 'src/typings/autocapture';
import { BrowserClient } from '@amplitude/analytics-types';
import { getClosestElement, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_CHANGED_EVENT } from '../constants';

export function trackChange({
  amplitude,
  allObservables,
  options,
  getEventProperties,
  shouldTrackEvent,
}: {
  amplitude: BrowserClient;
  allObservables: AllWindowObservables;
  options: AutoCaptureOptionsWithDefaults;
  getEventProperties: (actionType: ActionType, element: Element) => Record<string, any>;
  shouldTrackEvent: shouldTrackEvent;
}) {
  const { cssSelectorAllowlist } = options;
  const { changeObservable } = allObservables;

  const filteredChangeObservable = changeObservable.pipe(
    filter((changeEvent) => {
      // Filter out changeEvent events with no target
      // This could happen when change events are triggered programmatically
      if (changeEvent.event.target === null) {
        return false;
      }

      const closestTrackedAncestor = getClosestElement(changeEvent.event.target as HTMLElement, cssSelectorAllowlist);

      if (!closestTrackedAncestor) {
        return false;
      }

      // Only track change on elements that should be tracked,
      return shouldTrackEvent('change', closestTrackedAncestor);
    }),
  );

  return filteredChangeObservable.subscribe((changeEvent) => {
    const closestTrackedAncestor = getClosestElement(changeEvent.event.target as HTMLElement, cssSelectorAllowlist);

    amplitude?.track(AMPLITUDE_ELEMENT_CHANGED_EVENT, getEventProperties('change', closestTrackedAncestor as Element));
  });
}
