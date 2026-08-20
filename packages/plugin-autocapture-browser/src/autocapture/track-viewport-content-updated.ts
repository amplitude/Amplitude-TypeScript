import { BrowserClient, getDecodeURI, getGlobalScope } from '@amplitude/analytics-core';
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
  elementExposedInSentEvents,
  exposureTracker,
  isPageEnd,
  lastScroll,
}: {
  amplitude: BrowserClient;
  scrollTracker: ScrollTracker;
  currentElementExposed: Set<string>;
  elementExposedForPage: Set<string>;
  elementExposedInSentEvents: Set<string>;
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

  const newExposures = Array.from(currentElementExposed).filter(
    (elementPath) => !elementExposedInSentEvents.has(elementPath),
  );

  const eventProperties: Record<string, unknown> = {
    [constants.AMPLITUDE_EVENT_PROP_PAGE_URL]: getDecodeURI(
      /* istanbul ignore next */
      globalScope?.location?.href?.split('?')[0] ?? '',
    ),
    [constants.AMPLITUDE_EVENT_PROP_MAX_PAGE_X]: pageScrollMaxState.maxX + viewportWidth,
    [constants.AMPLITUDE_EVENT_PROP_MAX_PAGE_Y]: pageScrollMaxState.maxY + viewportHeight,
    [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_HEIGHT]: viewportHeight,
    [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_WIDTH]: viewportWidth,
    '[Amplitude] Element Exposed': newExposures,
  };

  const pageViewId = getCurrentPageViewId();
  if (pageViewId) {
    eventProperties[constants.AMPLITUDE_EVENT_PROP_PAGE_VIEW_ID] = pageViewId;
  }

  const resetPageViewState = () => {
    scrollTracker.reset();
    const resetScroll = scrollTracker.getState();
    lastScroll.maxX = resetScroll.maxX;
    lastScroll.maxY = resetScroll.maxY;
    elementExposedForPage.clear();
    elementExposedInSentEvents.clear();
    exposureTracker?.reset();
  };

  // If elements exposed is empty and max scroll is same as last event, don't track
  if (
    newExposures.length === 0 &&
    pageScrollMaxState.maxX === lastScroll.maxX &&
    pageScrollMaxState.maxY === lastScroll.maxY
  ) {
    if (isPageEnd) {
      resetPageViewState();
    }
    return;
  }

  /* istanbul ignore next */
  amplitude?.track('[Amplitude] Viewport Content Updated', eventProperties);
  lastScroll.maxX = pageScrollMaxState.maxX;
  lastScroll.maxY = pageScrollMaxState.maxY;

  newExposures.forEach((elementPath) => {
    elementExposedInSentEvents.add(elementPath);
  });

  // Clear current batch
  currentElementExposed.clear();

  if (isPageEnd) {
    // Reset state for next page view
    resetPageViewState();
  }
}

export function onExposure(
  elementPath: string,
  elementExposedForPage: Set<string>,
  elementExposedInSentEvents: Set<string>,
  currentElementExposed: Set<string>,
  fireViewportContentUpdatedCallback: (isPageEnd: boolean) => void,
) {
  if (elementExposedForPage.has(elementPath) || elementExposedInSentEvents.has(elementPath)) {
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
