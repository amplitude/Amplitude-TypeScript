/* eslint-disable no-restricted-globals */
import { DEFAULT_EXPOSURE_DURATION } from '@amplitude/analytics-core';
import { AllWindowObservables } from '../autocapture-plugin';
import { EXPOSURE_INTERSECTION_THRESHOLD } from '../constants';
import { DataExtractor } from '../data-extractor';

// Sub-pixel rounding can report a ratio a hair below the threshold on the very callback that
// crossed it, which would otherwise strand an element that stops scrolling right at the boundary.
const INTERSECTION_RATIO_TOLERANCE = 0.001;
const MIN_INTERSECTION_RATIO = EXPOSURE_INTERSECTION_THRESHOLD - INTERSECTION_RATIO_TOLERANCE;

// `isIntersecting` alone is not enough: the spec defines it as any overlap with the root, so the
// ratio is what actually holds the element to EXPOSURE_INTERSECTION_THRESHOLD.
const isSeen = (entry: IntersectionObserverEntry): boolean =>
  entry.isIntersecting && entry.intersectionRatio >= MIN_INTERSECTION_RATIO;

export function trackExposure({
  allObservables,
  onExposure,
  dataExtractor,
  exposureDuration = DEFAULT_EXPOSURE_DURATION,
}: {
  allObservables: AllWindowObservables;
  onExposure: (elementPath: string) => void;
  dataExtractor: DataExtractor;
  exposureDuration?: number;
}) {
  // Track which elements have been marked as exposed (per-element state)
  const exposureMap = new Map<Element, boolean>();

  // Track active timers for elements that are currently visible but not yet exposed
  const exposureTimerMap = new Map<Element, ReturnType<typeof setTimeout> | null | undefined>();

  const { exposureObservable } = allObservables;

  const exposureSubscription = exposureObservable.subscribe((event) => {
    const entry = event as unknown as IntersectionObserverEntry;
    const element = entry.target;

    if (isSeen(entry)) {
      // Element became visible enough - start exposure timer if not already exposed
      if (!exposureMap.get(element)) {
        const existingTimer = exposureTimerMap.get(element);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }
        const timer = setTimeout(() => {
          // Element has been visible for exposureDuration - mark as exposed
          exposureMap.set(element, true);

          // Record the CSS selector path in the shared exposure state
          const elementPath = dataExtractor.getElementPath(element);
          onExposure(elementPath);

          // Clear the timer reference
          exposureTimerMap.set(element, null);
        }, exposureDuration);

        exposureTimerMap.set(element, timer);
      }
    } else {
      // Element left the viewport or dropped below the threshold - cancel exposure timer if one exists
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
