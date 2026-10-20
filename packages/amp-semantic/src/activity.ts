/** Shared with frustration autocapture: either signal disqualifies a no-change click. */
export const isDeadClickChange = (type: string): boolean => type === 'mutation' || type === 'navigate';

/** Observe the same mutation categories in semantic fallback and frustration autocapture. */
export const DEAD_CLICK_MUTATION_OBSERVER_OPTIONS: MutationObserverInit = {
  childList: true,
  attributes: true,
  characterData: true,
  subtree: true,
};
