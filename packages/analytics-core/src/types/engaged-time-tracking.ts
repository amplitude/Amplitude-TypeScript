/**
 * Configuration options for engaged-time tracking.
 * @experimental This feature is experimental and may not be stable.
 */
export interface EngagedTimeOptions {
  /**
   * Event type for the independent engaged-time plugin. Defaults to `[Amplitude] Page Viewed`.
   * Waits for a matching event before starting engagement.
   */
  pageViewEventType?: string;
  /**
   * Event type emitted when engagement resumes on the same page after the previous view ends.
   * Defaults to pageViewEventType (or `[Amplitude] Page Viewed` when neither is set).
   * Use a separate name to keep resumed engagement out of primary PageView counts.
   */
  secondaryPageViewEventType?: string;
  /** Rolling activity window in milliseconds. Defaults to 5,000. */
  activityWindowMillis?: number;
  /** Snapshot cadence in milliseconds. Defaults to 15,000; must be shorter than inactivityTimeoutMillis. */
  heartbeatIntervalMillis?: number;
  /**
   * Finalize the page view after this many milliseconds without activity. Defaults to 180,000 (3 minutes).
   * Maximum: 86,400,000 (24 hours). Invalid values fall back to the default.
   * The same duration is sent as the delayed request timeout for server-side fallback after the last accepted heartbeat.
   */
  inactivityTimeoutMillis?: number;
}
