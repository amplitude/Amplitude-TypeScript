import { AllWindowObservables } from '../autocapture-plugin';
import { BrowserClient, getGlobalScope } from '@amplitude/analytics-core';

export interface ScrollState {
  maxX: number;
  maxY: number;
  /**
   * Smallest scrollY since tracking started for this page view, including the
   * offset at the moment the tracker attached. This is the top of the viewport,
   * not scrollY plus viewport height.
   */
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
  // Set by reset() until the next page view's scroll position is sampled.
  // Starts true so the offset at attach time becomes the first sample — a late
  // SDK load should report where the viewport already was, not 0.
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

    // A scroll that arrives before the post-navigation seed is the new baseline.
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
    /**
     * True after reset() until the next page view's scroll position is sampled.
     * A suppressed page end leaves this false, so a later seed cannot wipe a
     * range that is already in progress.
     */
    isAwaitingSeed: () => needsSeed,
    /**
     * Sample the current scroll position as the start of this page view.
     * No-op unless reset() marked the tracker, so a suppressed page end
     * cannot wipe a range that is already in progress.
     */
    seed: (): boolean => {
      if (!needsSeed) {
        return false;
      }
      seedFromCurrentPosition();
      return true;
    },
  };
}
