import { AllWindowObservables, AutoCaptureOptionsWithDefaults } from 'src/autocapture-plugin';
import { buffer, filter, map, debounceTime, merge, pairwise, delay } from 'rxjs';
import { BrowserClient } from '@amplitude/analytics-types';
import { shouldTrackEvent } from '../helpers';
import { AMPLITUDE_ELEMENT_CLICKED_EVENT } from '../constants';

const RAGE_CLICK_THRESHOLD = 5;

export function trackClicks({
  amplitude,
  allObservables,
  options,
  shouldTrackEvent,
}: {
  amplitude: BrowserClient;
  allObservables: AllWindowObservables;
  options: AutoCaptureOptionsWithDefaults;
  shouldTrackEvent: shouldTrackEvent;
}) {
  const { clickObservable } = allObservables;

  // Trigger if the target of the click event has changed
  const comparisonTrigger = clickObservable.pipe(
    pairwise(),
    filter(([prev, current]) => {
      return prev.event.target !== current.event.target;
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
    filter((click) => {
      // Filter out click events with no target
      // This could happen when click events are triggered programmatically
      if (click.event.target === null) {
        return false;
      }

      if (!click.closestTrackedAncestor) {
        return false;
      }

      // Only track clicks on elements that should be tracked,
      // Later this will be changed when mutation events are used
      return shouldTrackEvent('click', click.closestTrackedAncestor);
    }),
    buffer(triggers),
  );

  return bufferedClicks.subscribe((clicks) => {
    // TODO: update this when rage clicks are added
    const clickType =
      clicks.length >= RAGE_CLICK_THRESHOLD ? AMPLITUDE_ELEMENT_CLICKED_EVENT : AMPLITUDE_ELEMENT_CLICKED_EVENT;

    for (const click of clicks) {
      amplitude?.track(clickType, click.targetElementProperties, {
        time: click.timestamp,
      });
    }
  });
}
