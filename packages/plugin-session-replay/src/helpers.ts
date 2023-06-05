const PAYLOAD_ESTIMATED_SIZE_IN_BYTES_WITHOUT_EVENTS = 200; // derived by JSON stringifying an example payload without events
const MAX_EVENT_LIST_SIZE_IN_BYTES = 20 * 1000000 - PAYLOAD_ESTIMATED_SIZE_IN_BYTES_WITHOUT_EVENTS;
// const MAX_EVENT_LIST_SIZE_IN_BYTES = 80000;

export const shouldSplitEventsList = (eventsList: string[], nextEventString: string): boolean => {
  const sizeOfNextEvent = new Blob([nextEventString]).size;
  const sizeOfEventsList = new Blob(eventsList).size;
  if (sizeOfEventsList + sizeOfNextEvent >= MAX_EVENT_LIST_SIZE_IN_BYTES) {
    return true;
  }
  return false;
};
