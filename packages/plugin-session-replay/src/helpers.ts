// const PAYLOAD_ESTIMATED_SIZE_IN_BYTES_WITHOUT_EVENTS = 200; // derived by JSON stringifying an example payload without events
// const MAX_EVENT_LIST_SIZE_IN_BYTES = 20 * 1000000 - PAYLOAD_ESTIMATED_SIZE_IN_BYTES_WITHOUT_EVENTS;
const MAX_EVENT_LIST_SIZE_IN_BYTES = 80000;

export const shouldSplitEventsList = (eventsList: string[], nextEventString: string): boolean => {
  const sizeOfNextEvent = new Blob([nextEventString]).size;
  const sizeOfEventsList = new Blob(eventsList).size;
  if (sizeOfEventsList + sizeOfNextEvent >= MAX_EVENT_LIST_SIZE_IN_BYTES) {
    return true;
  }
  return false;
};

// Creates an array of elements split into groups the length of size.
// If array can't be split evenly, the final chunk will be the remaining elements.
// Works similary as https://lodash.com/docs/4.17.15#chunk

export const chunk = <T>(arr: T[], size: number) => {
  const chunkSize = Math.max(size, 1);
  return arr.reduce<T[][]>((chunks, element, index) => {
    const chunkIndex = Math.floor(index / chunkSize);
    if (!chunks[chunkIndex]) {
      chunks[chunkIndex] = [];
    }
    chunks[chunkIndex].push(element);
    return chunks;
  }, []);
};
