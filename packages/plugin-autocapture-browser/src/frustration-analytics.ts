/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable no-restricted-globals */
import { BrowserClient } from '@amplitude/analytics-types';

// import debounce from 'lodash.debounce';

import * as constants from './constants';

export type QueuedEvent = {
  timestamp: number;
  type: 'click';
  element: Element;
  event: Record<string, unknown>;
  shouldTrackEvent: boolean;
};

// const debouncedProcess = debounce((amplitude: BrowserClient) => processQueue(amplitude), 1000);
const debouncedProcess = (amplitude: BrowserClient) => processQueue(amplitude);
let eventQueue: QueuedEvent[] = [];
export const addToQueue = (event: QueuedEvent, amplitude: BrowserClient) => {
  // if new event is not the same as the ones in queue
  if (eventQueue.length && event.element !== eventQueue[0].element) {
    console.log(event.element !== eventQueue[0].element, event.element, eventQueue[0].element);
    console.log('process immediate');
    // Cancel the debounce and process everything that we have
    // debouncedProcess?.cancel();
    processQueue(amplitude);

    // Add the current event to the queue and start the debounce again
    eventQueue.push(event);
    debouncedProcess(amplitude);
  } else {
    console.log('debounce process');
    eventQueue.push(event);
    debouncedProcess(amplitude);
  }
};
export const processQueue = (amplitude: BrowserClient) => {
  const rageThreshold = 5;
  console.log('processQueue', eventQueue);
  // If length is greater than the rageThreshold, send rage click
  if (eventQueue.length >= rageThreshold) {
    /* istanbul ignore next */
    amplitude?.track(
      constants.AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT,
      { ...eventQueue[0].event, '[Amplitude] Number of clicks': eventQueue.length },
      { time: eventQueue[0].timestamp },
    );
  } else {
    for (const ev of eventQueue) {
      if (ev.shouldTrackEvent) {
        amplitude?.track(constants.AMPLITUDE_ELEMENT_CLICKED_EVENT, ev.event, { time: ev.timestamp });
      }
    }
  }
  eventQueue = [];
};
