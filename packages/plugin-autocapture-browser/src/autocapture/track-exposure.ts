/* eslint-disable no-restricted-globals */
import { DEFAULT_EXPOSURE_DURATION, getGlobalScope } from '@amplitude/analytics-core';
import { AllWindowObservables } from '../autocapture-plugin';
import { EXPOSURE_VIEWED_THRESHOLD } from '../constants';
import { DataExtractor } from '../data-extractor';

/**
 * Contentsquare's Zoning exposure metric considers a zone viewed when its
 * mid-height pixel line is inside the viewport. This is intentionally not an
 * intersection-area check: a zone taller than the viewport can still expose
 * its midpoint as the visitor scrolls through it.
 * https://support.contentsquare.com/hc/en-us/articles/37271856122001-Exposure-Rate
 */
const isMidHeightLineVisible = (element: Element): boolean => {
  const globalScope = getGlobalScope();
  /* istanbul ignore next -- trackExposure is only installed in a browser */
  const viewportHeight = globalScope?.innerHeight ?? 0;
  /* istanbul ignore next -- trackExposure is only installed in a browser */
  const viewportWidth = globalScope?.innerWidth ?? 0;
  const rect = element.getBoundingClientRect();
  const midHeightLine = rect.top + rect.height * EXPOSURE_VIEWED_THRESHOLD;

  return (
    midHeightLine >= 0 &&
    midHeightLine <= viewportHeight &&
    rect.right > 0 &&
    rect.left < viewportWidth &&
    rect.width > 0
  );
};

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

  // IntersectionObserver keeps this set limited to elements touching the viewport,
  // so scroll handling does not measure every allowlisted element on the page.
  const intersectingElements = new Set<Element>();

  const cancelExposure = (element: Element) => {
    const timer = exposureTimerMap.get(element);
    if (timer) {
      clearTimeout(timer);
      exposureTimerMap.set(element, null);
    }
  };

  const updateExposure = (element: Element) => {
    if (!isMidHeightLineVisible(element)) {
      cancelExposure(element);
      return;
    }

    if (exposureMap.get(element) || exposureTimerMap.get(element)) {
      return;
    }

    const timer = setTimeout(() => {
      exposureMap.set(element, true);

      const elementPath = dataExtractor.getElementPath(element);
      onExposure(elementPath);
      exposureTimerMap.set(element, null);
    }, exposureDuration);

    exposureTimerMap.set(element, timer);
  };

  const { exposureObservable, scrollObservable } = allObservables;

  const exposureSubscription = exposureObservable.subscribe((event) => {
    const entry = event as unknown as IntersectionObserverEntry;
    const element = entry.target;

    if (entry.isIntersecting) {
      intersectingElements.add(element);
      updateExposure(element);
    } else {
      intersectingElements.delete(element);
      cancelExposure(element);
    }
  });

  const scrollSubscription = scrollObservable.subscribe(() => {
    intersectingElements.forEach(updateExposure);
  });

  const clearExposureState = () => {
    exposureTimerMap.forEach((timer) => {
      if (timer) {
        clearTimeout(timer);
      }
    });
    exposureTimerMap.clear();
    exposureMap.clear();
    intersectingElements.clear();
  };

  return {
    unsubscribe: () => {
      exposureSubscription.unsubscribe();
      scrollSubscription.unsubscribe();
      clearExposureState();
    },
    reset: clearExposureState,
  };
}
