import { BrowserErrorEvent } from '../observables';
import { AllWindowObservables } from '../frustration-plugin';
import {
  ElementBasedTimestampedEvent,
  filterOutNonTrackableEvents,
  MouseButton,
  shouldTrackEvent,
  TimestampedEvent,
} from '../helpers';
import { BrowserClient, merge } from '@amplitude/analytics-core';
import { AMPLITUDE_ELEMENT_ERROR_CLICKED_EVENT } from '../constants';

type ClickOrErrorEvent = ElementBasedTimestampedEvent<MouseEvent> | TimestampedEvent<BrowserErrorEvent>;

const ERROR_CLICK_TIMEOUT = 2_000; // 2 seconds to wait for an error to happen

export function trackErrorClicks({
  amplitude,
  allObservables,
  shouldTrackErrorClick,
}: {
  amplitude: BrowserClient;
  allObservables: AllWindowObservables;
  shouldTrackErrorClick: shouldTrackEvent;
}) {
  const { clickObservable, browserErrorObservable } = allObservables;

  const filteredClickObservable = clickObservable.filter((click) => {
    return (
      filterOutNonTrackableEvents(click) &&
      shouldTrackErrorClick('click', click.closestTrackedAncestor) &&
      click.event.target instanceof Element &&
      click.event.target.closest('a[target="_blank"]') === null &&
      click.event.button === MouseButton.LEFT_OR_TOUCH_CONTACT
    );
  });

  let errorClickTimer: ReturnType<typeof setTimeout> | null = null;
  let latestClickEvent: ElementBasedTimestampedEvent<MouseEvent> | null = null;

  const clearClickTimer = () => {
    if (errorClickTimer !== null) {
      clearTimeout(errorClickTimer);
      errorClickTimer = null;
    }
    latestClickEvent = null;
  };

  return merge(filteredClickObservable, browserErrorObservable).subscribe((event: ClickOrErrorEvent) => {
    if (event.type === 'click') {
      clearClickTimer();
      latestClickEvent = event as ElementBasedTimestampedEvent<MouseEvent>;
      errorClickTimer = setTimeout(clearClickTimer, ERROR_CLICK_TIMEOUT);
      return;
    }

    if (event.type === 'error' && latestClickEvent) {
      amplitude.track(AMPLITUDE_ELEMENT_ERROR_CLICKED_EVENT, {
        ['[Amplitude] Kind']: event.event.kind,
        ['[Amplitude] Message']: event.event.message,
        ['[Amplitude] Stack']: event.event.stack,
        ['[Amplitude] Filename']: event.event.filename,
        ['[Amplitude] Line Number']: event.event.lineNumber,
        ['[Amplitude] Column Number']: event.event.columnNumber,
        ...latestClickEvent.targetElementProperties,
      });
      clearClickTimer();
    }
  });
}
