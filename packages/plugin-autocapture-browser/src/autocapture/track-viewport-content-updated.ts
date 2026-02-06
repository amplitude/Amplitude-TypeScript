import { BrowserClient, getGlobalScope } from '@amplitude/analytics-core';
import * as constants from '../constants';
import { getCurrentPageViewId } from '../helpers';

export interface ScrollTracker {
  getState: () => { maxX: number; maxY: number };
  reset: () => void;
}

export interface ExposureTracker {
  reset: () => void;
}

export function fireViewportContentUpdated({
  amplitude,
  scrollTracker,
  currentElementExposed,
  elementExposedForPage,
  exposureTracker,
  isPageEnd,
  lastScroll,
}: {
  amplitude: BrowserClient;
  scrollTracker: ScrollTracker;
  currentElementExposed: Set<string>;
  elementExposedForPage: Set<string>;
  exposureTracker: ExposureTracker | undefined;
  isPageEnd: boolean;
  lastScroll: { maxX: undefined | number; maxY: undefined | number };
}): void {
  const pageScrollMaxState = scrollTracker.getState();
  const globalScope = getGlobalScope();

  /* istanbul ignore next */
  const viewportWidth = globalScope?.innerWidth ?? 0;
  /* istanbul ignore next */
  const viewportHeight = globalScope?.innerHeight ?? 0;

  const eventProperties: Record<string, unknown> = {
    [constants.AMPLITUDE_EVENT_PROP_PAGE_URL]:
      /* istanbul ignore next */
      globalScope?.location?.href,
    [constants.AMPLITUDE_EVENT_PROP_MAX_PAGE_X]: pageScrollMaxState.maxX + viewportWidth,
    [constants.AMPLITUDE_EVENT_PROP_MAX_PAGE_Y]: pageScrollMaxState.maxY + viewportHeight,
    [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_HEIGHT]: viewportHeight,
    [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_WIDTH]: viewportWidth,
    '[Amplitude] Element Exposed': Array.from(currentElementExposed),
  };

  const pageViewId = getCurrentPageViewId();
  if (pageViewId) {
    eventProperties[constants.AMPLITUDE_EVENT_PROP_PAGE_VIEW_ID] = pageViewId;
  }

  // If elements exposed is empty and max scroll is same as last event, don't track
  if (
    currentElementExposed.size === 0 &&
    pageScrollMaxState.maxX === lastScroll.maxX &&
    pageScrollMaxState.maxY === lastScroll.maxY
  ) {
    return;
  }

  /* istanbul ignore next */
  amplitude?.track('[Amplitude] Viewport Content Updated', eventProperties);
  lastScroll = { maxX: pageScrollMaxState.maxX, maxY: pageScrollMaxState.maxY };

  // Clear current batch
  currentElementExposed.clear();

  if (isPageEnd) {
    // Reset state for next page view
    scrollTracker.reset();
    elementExposedForPage.clear();
    exposureTracker?.reset();
  }
}

export function onExposure(
  elementPath: string,
  elementExposedForPage: Set<string>,
  currentElementExposed: Set<string>,
  fireViewportContentUpdatedCallback: (isPageEnd: boolean) => void,
) {
  if (elementExposedForPage.has(elementPath)) {
    return;
  }
  elementExposedForPage.add(elementPath);
  currentElementExposed.add(elementPath);

  // Check if current set size exceeds 18k chars
  const exposedArray = Array.from(currentElementExposed);
  const exposedString = JSON.stringify(exposedArray);

  if (exposedString.length >= constants.MAX_ELEMENT_EXPOSED_STR_LENGTH) {
    fireViewportContentUpdatedCallback(false);
  }
}
