import { AllWindowObservables, AutoCaptureOptionsWithDefaults } from 'src/autocapture-plugin';
import { type evaluateTriggersFn } from 'src/helpers';
import { filter, map } from 'rxjs';
import { BrowserClient } from '@amplitude/analytics-core';
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
  options: AutoCaptureOptionsWithDefaults;
  shouldTrackEvent: shouldTrackEvent;
  evaluateTriggers: evaluateTriggersFn;
}) {
  const { clickObservable } = allObservables;

  const bufferedClicks = clickObservable.pipe(
    filter(filterOutNonTrackableEvents),
    filter((click) => {
      // Only track clicks on elements that should be tracked,
      return shouldTrackEvent('click', click.closestTrackedAncestor);
    }),
    map((click) => evaluateTriggers(click)),
  );

  return bufferedClicks.subscribe((click) => {
    /* istanbul ignore next */
    amplitude?.track(AMPLITUDE_ELEMENT_CLICKED_EVENT, click.targetElementProperties);
  });
}
