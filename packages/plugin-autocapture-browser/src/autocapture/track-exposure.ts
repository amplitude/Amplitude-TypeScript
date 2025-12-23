/* eslint-disable no-restricted-globals */
import { AllWindowObservables } from '../autocapture-plugin';
import { DataExtractor } from '../data-extractor';

// Element must be visible for 1 second to count as "exposed"
const EXPOSURE_TIMEOUT = 1_000;

export function trackExposure({
  allObservables,
  onExposure,
  dataExtractor,
}: {
  allObservables: AllWindowObservables;
  onExposure: (elementPath: string) => void;
  dataExtractor: DataExtractor;
}) {
  // Track which elements have been marked as exposed (per-element state)
  const exposureMap = new Map<Element, boolean>();

  // Track active timers for elements that are currently visible but not yet exposed
  const exposureTimerMap = new Map<Element, ReturnType<typeof setTimeout> | null | undefined>();

  const { exposureObservable } = allObservables;

  const exposureSubscription = exposureObservable.subscribe((event) => {
    const entry = event as unknown as IntersectionObserverEntry;
    const element = entry.target;

    if (entry.isIntersecting) {
      // Element became visible - start exposure timer if not already exposed
      if (!exposureMap.get(element)) {
        const timer = setTimeout(() => {
          // Element has been visible for EXPOSURE_TIMEOUT - mark as exposed
          exposureMap.set(element, true);

          // Record the CSS selector path in the shared exposure state
          const elementPath = dataExtractor.getElementPath(element);
          onExposure(elementPath);

          // Clear the timer reference
          exposureTimerMap.set(element, null);
        }, EXPOSURE_TIMEOUT);

        exposureTimerMap.set(element, timer);
      }
    } else if (!entry.isIntersecting && entry.intersectionRatio < 1.0) {
      // Element left viewport - cancel exposure timer if one exists
      const timer = exposureTimerMap.get(element);
      if (timer) {
        clearTimeout(timer);
        exposureTimerMap.set(element, null);
      }
    }
  });

  return {
    unsubscribe: () => {
      exposureSubscription.unsubscribe();
    },
    reset: () => {
      exposureTimerMap.forEach((timer) => {
        if (timer) {
          clearTimeout(timer);
        }
      });
      exposureTimerMap.clear();
      exposureMap.clear();
    },
  };
}
