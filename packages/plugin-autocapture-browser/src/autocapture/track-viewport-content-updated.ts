import { BrowserClient, getGlobalScope } from '@amplitude/analytics-core';
import * as constants from '../constants';

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
  pageViewEndFired,
}: {
  amplitude: BrowserClient;
  scrollTracker: ScrollTracker;
  currentElementExposed: Set<string>;
  elementExposedForPage: Set<string>;
  exposureTracker: ExposureTracker | undefined;
  isPageEnd: boolean;
  pageViewEndFired: boolean;
}): boolean {
  if (isPageEnd && pageViewEndFired) {
    return pageViewEndFired;
  }

  let newPageViewEndFired = pageViewEndFired;
  if (isPageEnd) {
    newPageViewEndFired = true;
  }

  const pageScrollMaxState = scrollTracker.getState();
  const globalScope = getGlobalScope();

  const eventProperties: Record<string, unknown> = {
    [constants.AMPLITUDE_EVENT_PROP_PAGE_URL]: globalScope?.location?.href,
    [constants.AMPLITUDE_EVENT_PROP_MAX_PAGE_X]: pageScrollMaxState.maxX,
    [constants.AMPLITUDE_EVENT_PROP_MAX_PAGE_Y]: pageScrollMaxState.maxY,
    [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_HEIGHT]: globalScope?.innerHeight,
    [constants.AMPLITUDE_EVENT_PROP_VIEWPORT_WIDTH]: globalScope?.innerWidth,
    '[Amplitude] Element Exposed': Array.from(currentElementExposed),
  };
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  amplitude?.track('[Amplitude] Viewport Content Updated', eventProperties);

  // Clear current batch
  currentElementExposed.clear();

  if (isPageEnd) {
    // Reset state for next page view
    scrollTracker.reset();
    elementExposedForPage.clear();
    exposureTracker?.reset();
  }

  return newPageViewEndFired;
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

  if (exposedString.length >= 18000) {
    fireViewportContentUpdatedCallback(false);
  }
}
