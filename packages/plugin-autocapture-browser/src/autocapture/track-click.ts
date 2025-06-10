import {
  AllWindowObservables,
  AutoCaptureOptionsWithDefaults,
  type ElementBasedTimestampedEvent,
  type evaluateTriggersFn,
} from 'src/autocapture-plugin';
import { buffer, filter, map, debounceTime, merge, pairwise, delay } from 'rxjs';
import { BrowserClient } from '@amplitude/analytics-core';
import { filterOutNonTrackableEvents, shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_CLICKED_EVENT } from '../constants';

const RAGE_CLICK_THRESHOLD = 5;

export function trackClicks({
  amplitude,
  allObservables,
  options,
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

  // Trigger if the target of the click event has changed and position is different
  // Keeping track of position is important to avoid false positives when the user clicks on the same
  // element where certain frameworks could replace the element instance between rerenders
  const comparisonTrigger = clickObservable.pipe(
    pairwise(),
    filter(([prev, current]) => {
      const targetChanged = prev.event.target !== current.event.target;
      /* istanbul ignore next */
      const samePos =
        Math.abs(current.event.screenX - prev.event.screenX) <= 20 &&
        Math.abs(current.event.screenY - prev.event.screenY) <= 20;
      return targetChanged && !samePos;
    }),
  );

  // Trigger if there is no click event within 1 second
  const timeoutTrigger = clickObservable.pipe(
    debounceTime(options.debounceTime),
    map(() => 'timeout' as const),
  );

  const triggers = merge(comparisonTrigger, timeoutTrigger);

  // Get buffers of clicks, if the buffer length is over 5, it is rage click
  const bufferedClicks = clickObservable.pipe(
    delay(0),
    filter(filterOutNonTrackableEvents),
    filter((click) => {
      // Only track clicks on elements that should be tracked,
      return shouldTrackEvent('click', click.closestTrackedAncestor);
    }),
    map((click) => evaluateTriggers(click)),
    buffer(triggers),
  );

  return bufferedClicks.subscribe((clicks) => {
    // TODO: update this when rage clicks are added
    const clickType =
      clicks.length >= RAGE_CLICK_THRESHOLD ? AMPLITUDE_ELEMENT_CLICKED_EVENT : AMPLITUDE_ELEMENT_CLICKED_EVENT;

    for (const click of clicks) {
      /* istanbul ignore next */
      amplitude?.track(clickType, click.targetElementProperties);
    }
  });
}
