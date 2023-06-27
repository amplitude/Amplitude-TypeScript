export const shouldSplitEventsList = (eventsList: string[], nextEventString: string, maxListSize: number): boolean => {
  const sizeOfNextEvent = new Blob([nextEventString]).size;
  const sizeOfEventsList = new Blob(eventsList).size;
  if (sizeOfEventsList + sizeOfNextEvent >= maxListSize) {
    return true;
  }
  return false;
};
