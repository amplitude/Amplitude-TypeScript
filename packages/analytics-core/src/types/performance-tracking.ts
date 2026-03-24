/**
 * Configuration options for main thread block tracking
 */
export interface MainThreadBlockOptions {
  /**
   * Minimum duration in milliseconds to consider a main thread block.
   * The browser minimum for both Long Animation Frames and Long Tasks is 50ms.
   * @default 50
   */
  durationThreshold?: number;
}

/**
 * Configuration options for performance tracking.
 */
export interface PerformanceTrackingOptions {
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
  pageUrlExcludelist?: (string | RegExp)[];

  /**
   * Configuration for main thread block tracking.
   * Uses the Long Animation Frames API where available, falling back to Long Tasks.
   * Set to `false` to disable tracking.
   * Set to `true` or an options object to enable with default or custom settings.
   * Default is false.
   */
  mainThreadBlock?: boolean | MainThreadBlockOptions;
}
