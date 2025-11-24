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

  const scrollSubscription = scrollObservable.subscribe(() => {
    const globalScope = getGlobalScope();
    const currentX = Math.floor(globalScope?.scrollX ?? globalScope?.pageXOffset ?? 0);
    const currentY = Math.floor(globalScope?.scrollY ?? globalScope?.pageYOffset ?? 0);

    // Update page-level max positions for Page View End event (never resets during page lifetime)
    state.maxX = Math.max(state.maxX, currentX);
    state.maxY = Math.max(state.maxY, currentY);
  });

  return {
    unsubscribe: () => {
      scrollSubscription.unsubscribe();
    },
    getState: () => state,
    reset: () => {
      state.maxX = 0;
      state.maxY = 0;
    },
  };
}
