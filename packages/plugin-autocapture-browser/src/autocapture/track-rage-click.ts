import { AllWindowObservables } from 'src/autocapture-plugin';
import { filter, map, bufferTime } from 'rxjs';
import { BrowserClient } from '@amplitude/analytics-core';
import { filterOutNonTrackableEvents, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT } from '../constants';

const RAGE_CLICK_THRESHOLD = 5;
const RAGE_CLICK_WINDOW_MS = 3000; // 3 seconds

export function trackRageClicks({
  amplitude,
  allObservables,
  shouldTrackEvent,
}: {
  amplitude: BrowserClient;
  allObservables: AllWindowObservables;
  shouldTrackEvent: shouldTrackEvent;
}) {
  const { clickObservable } = allObservables;

  // Buffer clicks within a RAGE_CLICK_WINDOW_MS window and filter for rage clicks
  const rageClickObservable = clickObservable.pipe(
    filter(filterOutNonTrackableEvents),
    filter((click) => {
      return shouldTrackEvent('click', click.closestTrackedAncestor);
    }),
    bufferTime(RAGE_CLICK_WINDOW_MS),
    filter((clicks) => {
      if (clicks.length < RAGE_CLICK_THRESHOLD) {
        return false;
      }

      // it is only a rage click if the last RAGE_CLICK_THRESHOLD clicks are on the same element
      const lastClickTarget = clicks[clicks.length - 1].event.target;
      const trailingClicks = clicks
        .slice()
        .reverse()
        .filter((click) => click.event.target === lastClickTarget)
        .reverse();
      // TODO: add the Click properties to the rage click event
      // TODO: backdate the timestamp to be the first click in the sequence
      return trailingClicks.length >= RAGE_CLICK_THRESHOLD;
    }),
    map((clicks) => clicks[0]), // Take the first click of the rage sequence
  );

  return rageClickObservable.subscribe((click) => {
    /* istanbul ignore next */
    amplitude?.track(AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT, {
      ...click.targetElementProperties,
    });
  });
}
