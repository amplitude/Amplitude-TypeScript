import { merge, timer, Observable } from 'rxjs';
import { buffer, filter, map, switchMap } from 'rxjs/operators';
import * as constants from '../constants';
import { ActionType } from 'src/typings/autocapture';
import { BrowserClient } from '@amplitude/analytics-types';
export function trackErrors(
  {
    clickObservable,
    keydownObservable,
    errorObservable,
  }: {
    clickObservable: Observable<MouseEvent>;
    keydownObservable: Observable<KeyboardEvent>;
    errorObservable: Observable<ErrorEvent>;
  },
  amplitude: any,
  getEventProperties: (actionType: ActionType, element: Element) => Record<string, any>,
) {
  // Combine all events
  const allEventsObservable: Observable<Event> = merge(clickObservable, keydownObservable, errorObservable);

  // Create an Observable that emits after 500ms of each event
  const timeWindowObservable = allEventsObservable.pipe(switchMap(() => timer(500)));

  // Buffer all events that occur within 500ms
  const bufferedEvents = allEventsObservable.pipe(
    buffer(timeWindowObservable),
    filter((events) => events.some((event) => event.type === 'error')),
    map((events) => {
      const errorIndex = events.findIndex((event) => event.type === 'error');
      // Only include events before the error
      const eventsBeforeError = events.slice(0, errorIndex);
      return {
        events: eventsBeforeError,
        bufferStartTime: eventsBeforeError[0].timeStamp,
        bufferEndTime: eventsBeforeError[eventsBeforeError.length - 1].timeStamp,
      };
    }),
  );

  // Subscribe to the buffered events and log them
  bufferedEvents.subscribe({
    next({ events }) {
      const triggeringEvent = events[events.length - 1];
      if (!amplitude) {
        return;
      }
      /* istanbul ignore next */
      (amplitude as BrowserClient).track(
        constants.AMPLITUDE_ELEMENT_ERROR_CLICKED_EVENT as string,
        getEventProperties(
          triggeringEvent.type === 'mousedown' ? 'click' : 'keydown',
          triggeringEvent.target as Element,
        ),
      );
    },
    error(err) {
      console.error('Error in buffered events subscription:', err);
    },
  });
}
