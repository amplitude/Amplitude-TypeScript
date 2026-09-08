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
// Engines round fractional scroll offsets differently, so after the same scroll the
// mid-height line can land a fraction of a pixel either side of the viewport edge.
// A sub-pixel difference should not decide whether a zone was viewed.
const MID_HEIGHT_LINE_TOLERANCE_PX = 1;

const CLIPPING_OVERFLOW_VALUES = new Set(['auto', 'clip', 'hidden', 'overlay', 'scroll']);
const clipsAxis = (overflow: string): boolean => CLIPPING_OVERFLOW_VALUES.has(overflow);

const getVisualParent = (element: Element): Element | null => {
  if (element.assignedSlot) {
    return element.assignedSlot;
  }
  if (element.parentElement) {
    return element.parentElement;
  }
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
};

const isMidHeightLineVisible = (element: Element): boolean => {
  const globalScope = getGlobalScope();
  /* istanbul ignore next -- trackExposure is only installed in a browser */
  const viewportHeight = globalScope?.innerHeight ?? 0;
  /* istanbul ignore next -- trackExposure is only installed in a browser */
  const viewportWidth = globalScope?.innerWidth ?? 0;
  const rect = element.getBoundingClientRect();
  const midHeightLine = rect.top + rect.height * EXPOSURE_VIEWED_THRESHOLD;
  let visibleLeft = Math.max(rect.left, 0);
  let visibleRight = Math.min(rect.right, viewportWidth);

  if (
    midHeightLine < -MID_HEIGHT_LINE_TOLERANCE_PX ||
    midHeightLine > viewportHeight + MID_HEIGHT_LINE_TOLERANCE_PX ||
    visibleLeft >= visibleRight ||
    rect.width <= 0
  ) {
    return false;
  }

  let ancestor = getVisualParent(element);
  while (ancestor) {
    /* istanbul ignore next -- getComputedStyle exists whenever trackExposure is installed */
    const style = globalScope?.getComputedStyle(ancestor);
    if (style) {
      const ancestorRect = ancestor.getBoundingClientRect();
      if (
        clipsAxis(style.overflowY) &&
        (midHeightLine < ancestorRect.top - MID_HEIGHT_LINE_TOLERANCE_PX ||
          midHeightLine > ancestorRect.bottom + MID_HEIGHT_LINE_TOLERANCE_PX)
      ) {
        return false;
      }
      if (clipsAxis(style.overflowX)) {
        visibleLeft = Math.max(visibleLeft, ancestorRect.left);
        visibleRight = Math.min(visibleRight, ancestorRect.right);
        if (visibleLeft >= visibleRight) {
          return false;
        }
      }
    }
    ancestor = getVisualParent(ancestor);
  }

  return true;
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
