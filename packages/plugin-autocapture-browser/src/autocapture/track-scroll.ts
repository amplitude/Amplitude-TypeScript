import { AllWindowObservables } from '../autocapture-plugin';
import { BrowserClient, getGlobalScope } from '@amplitude/analytics-core';

export interface ScrollState {
  maxX: number;
  maxY: number;
}

export function trackScroll({
  amplitude,
  allObservables,
}: {
  amplitude: BrowserClient;
  allObservables: AllWindowObservables;
}) {
  // amplitude is reserved for future periodic scroll event tracking
  void amplitude;

  const { scrollObservable } = allObservables;
  const state: ScrollState = { maxX: 0, maxY: 0 };

  // Update page-level max positions for Page View End event (never resets during page lifetime)
  const recordCurrentPosition = () => {
    const globalScope = getGlobalScope();
    /* istanbul ignore next */
    const currentX = Math.floor(globalScope?.scrollX ?? globalScope?.pageXOffset ?? 0);
    /* istanbul ignore next */
    const currentY = Math.floor(globalScope?.scrollY ?? globalScope?.pageYOffset ?? 0);

    state.maxX = Math.max(state.maxX, currentX);
    state.maxY = Math.max(state.maxY, currentY);
  };

  const scrollSubscription = scrollObservable.subscribe(recordCurrentPosition);

  return {
    unsubscribe: () => {
      scrollSubscription.unsubscribe();
    },
    // Folding in the current position covers scrolling this subscription never saw, such as the
    // browser jumping to a URL fragment on load or restoring the position on a reload.
    getState: () => {
      recordCurrentPosition();
      return state;
    },
    reset: () => {
      state.maxX = 0;
      state.maxY = 0;
    },
  };
}
