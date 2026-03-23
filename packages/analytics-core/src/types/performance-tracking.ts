/**
 * Configuration options for long task tracking
 */
export interface LongTaskOptions {
  /**
   * Minimum duration in milliseconds to consider a long task.
   * The browser minimum is 50ms.
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
   * Configuration for long task tracking.
   * Set to `false` to disable long task tracking.
   * Set to `true` or an options object to enable with default or custom settings.
   * Default is false.
   */
  longTask?: boolean | LongTaskOptions;
}
