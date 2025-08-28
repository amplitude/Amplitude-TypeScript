import { ActionType } from './element-interactions';

/**
 * Configuration options for dead clicks tracking
 */
export interface DeadClickOptions {
  /**
   * CSS selectors to define which elements on the page to track for dead clicks.
   * A dead click is a click that doesn't result in any visible change or navigation.
   */
  cssSelectorAllowlist?: string[];
}

/**
 * Configuration options for rage clicks tracking
 */
export interface RageClickOptions {
  /**
   * CSS selectors to define which elements on the page to track for rage clicks.
   * A rage click is multiple rapid clicks on the same element within a 3s time window.
   */
  cssSelectorAllowlist?: string[];
}

/**
 * Configuration options for frustration interactions tracking.
 * This includes dead clicks and rage clicks tracking.
 */
export interface FrustrationInteractionsOptions {
  /**
   * List of page URLs to allow auto tracking on.
   * When provided, only allow tracking on these URLs.
   * Both full URLs and regex are supported.
   */
  pageUrlAllowlist?: (string | RegExp)[];

  /**
   * List of page URLs to exclude from auto tracking.
   * When provided, tracking will be blocked on these URLs.
   * Both full URLs and regex are supported.
   * This takes precedence over pageUrlAllowlist.
   */
  pageUrlExcludelist?: (RegExp | string | { pattern: string })[];

  /**
   * Function to determine whether an event should be tracked.
   * When provided, this function overwrites all other allowlists and configurations.
   * If the function returns true, the event will be tracked.
   * If the function returns false, the event will not be tracked.
   * @param actionType - The type of action that triggered the event.
   * @param element - The [Element](https://developer.mozilla.org/en-US/docs/Web/API/Element) that triggered the event.
   */
  shouldTrackEventResolver?: (actionType: ActionType, element: DomElement) => boolean;

  /**
   * Prefix for data attributes to allow auto collecting.
   * Default is 'data-amp-track-'.
   */
  dataAttributePrefix?: string;

  /**
   * Configuration for dead clicks tracking
   */
  deadClicks?: DeadClickOptions;

  /**
   * Configuration for rage clicks tracking
   */
  rageClicks?: RageClickOptions;
}

const CLICKABLE_ELEMENT_SELECTORS = [
  'a',
  'button',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="treeitem"]',
  '[contenteditable="true" i]',
];

/**
 * Default CSS selectors for dead clicks tracking
 */
export const DEFAULT_DEAD_CLICK_ALLOWLIST = [
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="image"]',
  'input[type="file"]',
  ...CLICKABLE_ELEMENT_SELECTORS,
];

/**
 * Default CSS selectors for rage clicks tracking
 */
export const DEFAULT_RAGE_CLICK_ALLOWLIST = ['*'];

/**
 * Default time window for dead clicks (3 seconds)
 */
export const DEFAULT_DEAD_CLICK_WINDOW_MS = 3_000;

/**
 * Default time window for rage clicks (1 second)
 */
export const DEFAULT_RAGE_CLICK_WINDOW_MS = 1_000;

/**
 * Default threshold for rage clicks (4 clicks)
 */
export const DEFAULT_RAGE_CLICK_THRESHOLD = 4;

// DomElement is [Element](https://developer.mozilla.org/en-US/docs/Web/API/Element) if the dom library is included in tsconfig.json
// and never if it is not included
// eslint-disable-next-line no-restricted-globals
type DomElement = typeof globalThis extends {
  Element: new (...args: any) => infer T;
}
  ? T
  : never;
