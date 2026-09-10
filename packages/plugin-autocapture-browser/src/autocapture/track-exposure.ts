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

const getVisualParent = (element: Element): Element | null => {
  return element.assignedSlot || element.parentElement || (element.parentNode as ShadowRoot | null)?.host || null;
};

/**
 * The next ancestor whose overflow can clip `element`. Absolute and fixed elements
 * are only clipped from their containing block upwards, which browsers expose as
 * `offsetParent` — so static wrappers they paint outside of are skipped, and a
 * transform/filter/contain ancestor that does establish a containing block still
 * clips. `null` means the containing block is the viewport.
 */
const getClippingParent = (element: Element, position: string): Element | null => {
  return (position === 'fixed' || position === 'absolute') && element instanceof HTMLElement
    ? element.offsetParent
    : getVisualParent(element);
};

const isMidHeightLineVisible = (element: Element): boolean => {
  const globalScope = getGlobalScope();
  /* istanbul ignore next -- trackExposure is only installed in a browser */
  const viewportHeight = globalScope!.document.documentElement.clientHeight || globalScope!.innerHeight;
  /* istanbul ignore next -- trackExposure is only installed in a browser */
  const viewportWidth = globalScope!.document.documentElement.clientWidth || globalScope!.innerWidth;
  const rect = element.getBoundingClientRect();
  const midHeightLine = rect.top + rect.height * EXPOSURE_VIEWED_THRESHOLD;
  // Track the still-visible span of the mid-height line as ancestors clip it.
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

  let ancestor = getClippingParent(element, globalScope!.getComputedStyle(element).position);
  while (ancestor) {
    /* istanbul ignore next -- trackExposure is only installed in a browser */
    const style = globalScope!.getComputedStyle(ancestor);
    // Browsers return "visible" by default; jsdom returns an empty string.
    const clipsY = style.overflowY && style.overflowY !== 'visible';
    const clipsX = style.overflowX && style.overflowX !== 'visible';
    if (clipsY || clipsX) {
      const ancestorRect = ancestor.getBoundingClientRect();
      if (
        clipsY &&
        (midHeightLine < ancestorRect.top - MID_HEIGHT_LINE_TOLERANCE_PX ||
          midHeightLine > ancestorRect.bottom + MID_HEIGHT_LINE_TOLERANCE_PX)
      ) {
        return false;
      }
      if (clipsX) {
        visibleLeft = Math.max(visibleLeft, ancestorRect.left);
        visibleRight = Math.min(visibleRight, ancestorRect.right);
        if (visibleLeft >= visibleRight) {
          return false;
        }
      }
    }
    ancestor = getClippingParent(ancestor, style.position);
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

  // Page-view scoped: which zones were already reported, plus any dwell in
  // progress. The intersecting set is deliberately left alone — it tracks live
  // viewport geometry, and IntersectionObserver does not re-notify an element
  // that is already intersecting, so dropping it here would silently stop the
  // scroll checks for everything currently on screen.
  const clearPageViewState = () => {
    exposureTimerMap.forEach((timer) => {
      if (timer) {
        clearTimeout(timer);
      }
    });
    exposureTimerMap.clear();
    exposureMap.clear();
  };

  return {
    unsubscribe: () => {
      exposureSubscription.unsubscribe();
      scrollSubscription.unsubscribe();
      clearPageViewState();
      intersectingElements.clear();
    },
    reset: () => {
      clearPageViewState();
      // A new page view starts fresh, so anything already sitting at its midpoint
      // begins its dwell again rather than waiting for the next scroll.
      intersectingElements.forEach(updateExposure);
    },
  };
}
