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
   * Configuration for dead clicks tracking
   */
  deadClicks?: DeadClickOptions;

  /**
   * Configuration for rage clicks tracking
   */
  rageClicks?: RageClickOptions;
}

/**
 * Default CSS selectors for dead clicks tracking
 */
export const DEFAULT_DEAD_CLICK_ALLOWLIST = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[contenteditable="true" i]',
];

/**
 * Default CSS selectors for rage clicks tracking
 */
export const DEFAULT_RAGE_CLICK_ALLOWLIST = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[contenteditable="true" i]',
];

/**
 * Default time window for dead clicks (1 second)
 */
export const DEFAULT_DEAD_CLICK_WINDOW_MS = 3000;

/**
 * Default time window for rage clicks (3 seconds)
 */
export const DEFAULT_RAGE_CLICK_WINDOW_MS = 3000;

/**
 * Default threshold for rage clicks (5 clicks)
 */
export const DEFAULT_RAGE_CLICK_THRESHOLD = 5;
