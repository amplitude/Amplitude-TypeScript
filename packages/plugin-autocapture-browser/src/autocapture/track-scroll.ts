import { AllWindowObservables } from '../autocapture-plugin';
import { BrowserClient, getGlobalScope } from '@amplitude/analytics-core';

export interface ScrollState {
  maxX: number;
  maxY: number;
  /** Smallest scrollY since this page view started. Not scrollY plus viewport height. */
  minY: number;
}

const readScrollPosition = (): { x: number; y: number } => {
  const globalScope = getGlobalScope();
  /* istanbul ignore next */
  const x = Math.floor(globalScope?.scrollX ?? globalScope?.pageXOffset ?? 0);
  /* istanbul ignore next */
  const y = Math.floor(globalScope?.scrollY ?? globalScope?.pageYOffset ?? 0);
  return { x, y };
};

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
  const state: ScrollState = { maxX: 0, maxY: 0, minY: 0 };
  let needsSeed = true;

  const seedFromCurrentPosition = () => {
    const { x, y } = readScrollPosition();
    state.maxX = x;
    state.maxY = y;
    state.minY = y;
    needsSeed = false;
  };

  seedFromCurrentPosition();

  const scrollSubscription = scrollObservable.subscribe(() => {
    const { x, y } = readScrollPosition();

    if (needsSeed) {
      state.maxX = x;
      state.maxY = y;
      state.minY = y;
      needsSeed = false;
      return;
    }

    state.maxX = Math.max(state.maxX, x);
    state.maxY = Math.max(state.maxY, y);
    state.minY = Math.min(state.minY, y);
  });

  return {
    unsubscribe: () => {
      scrollSubscription.unsubscribe();
    },
    getState: () => state,
    reset: () => {
      state.maxX = 0;
      state.maxY = 0;
      state.minY = 0;
      needsSeed = true;
    },
    isAwaitingSeed: () => needsSeed,
    /** Samples the current offset. No-op unless reset() is waiting for that sample. */
    seed: (): boolean => {
      if (!needsSeed) {
        return false;
      }
      seedFromCurrentPosition();
      return true;
    },
  };
}
