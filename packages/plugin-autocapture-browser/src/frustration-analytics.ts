/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable no-restricted-globals */
import { BrowserClient } from '@amplitude/analytics-types';

import debounce from 'lodash.debounce';

import * as constants from './constants';

export type QueuedEvent = {
  timestamp: number,
  type: "click",
  element: Element,
  event: Record<string, unknown>,
  shouldTrackEvent: boolean,
}

const debouncedProcess = debounce((amplitude:BrowserClient) => processQueue(amplitude), 1000);
let eventQueue: QueuedEvent[] = [];
export const addToQueue = (event: QueuedEvent, amplitude:BrowserClient) => {
    // if new event is not the same as the ones in queue

    if (eventQueue.length && event.element !== eventQueue[0].element) {
        console.log(event.element !== eventQueue[0].element, event.element ,eventQueue[0].element);
        console.log('process immediate');
        // Cancel the debounce and process everything that we have
        debouncedProcess.cancel()
        processQueue(amplitude)

        // Add the current event to the queue and start the debounce again
        eventQueue.push(event)
        debouncedProcess(amplitude);
    } else {
        console.log('debounce process');
        eventQueue.push(event)
        debouncedProcess(amplitude);
    }
}
// iterate over the click events and figure out which amplitude events to send

// Clicks: link, div, button, button, button, button, button, div
// Event: Link Clicked, Rage Clicked
// Example 2:
//                                           V
// Clicks: button, div, div, div, div, div, div, div, div, div
// Event: Button Clicked, Rage Clicked,
// Example 3:
// Clicks: button, button, button, button, button, button
// Event: Rage Clicked, Button Clicked
export const processQueue = (amplitude:BrowserClient) => {
    const rageThreshold = 5;
    console.log('processQueue', eventQueue);
    // If length is greater than the rageThreshold, send rage click
    if (eventQueue.length >= rageThreshold) {
        /* istanbul ignore next */
        amplitude?.track(constants.AMPLITUDE_ELEMENT_RAGE_CLICKED_EVENT, {...eventQueue[0].event, '[Amplitude] Number of clicks': eventQueue.length}, {time: eventQueue[0].timestamp});

    } else{

        for(const ev of eventQueue) {
            if (ev.shouldTrackEvent) {
                amplitude?.track(constants.AMPLITUDE_ELEMENT_CLICKED_EVENT, ev.event,  {time: ev.timestamp});
            }
        }
    }
        eventQueue = []

    // for (let i = 0; i <= eventQueue.length; i++) {
    //     const currentEvent = eventQueue[i];
    //     if (prevElement?.element !== currentEvent?.element) {
    //         if(prevElement?.shouldTrackEvent) {
    //             /* istanbul ignore next */
    //             amplitude?.track(constants.AMPLITUDE_ELEMENT_CLICKED_EVENT, prevElement.event);
    //         }
    //     } else {
    //         rageCounter++;
    //         if (rageCounter === rageThreshold && prevElement) {

    //             rageCounter = 0;
    //         }
    //     }
    //     // check if event was different
    //     // then flushSync() immediately
    //     prevElement = currentEvent;
    // }
    // eventQueue = [];
  // check if event was different
  // then flushSync() immediately

  //  flush()
};
// rage click = 5 clicks in 1 second on the same element
// add to array
// call debounce to flush in a second if it hasnt received any other events OR if the event that was just added was different
// how to compare elements? use .isSameNode or === https://developer.mozilla.org/en-US/docs/Web/API/Node/isSameNode

// []
// This send the amplitude events using amplitude.track
// const eventsToSend = [];
// const flushSync = () => {

// }

// const flush = () => {
//   // debounce 1000ms
// }
