export interface PageTrackingOptions {
  trackOn?: PageTrackingTrackOn;
  trackHistoryChanges?: PageTrackingHistoryChanges;
  eventType?: string;
  pageCounter?: number;
  /**
   * Delay page-view ingestion and attach cumulative engaged time. True or an options object enables it.
   * @defaultValue `false`
   * @experimental This feature is experimental and may not be stable.
   */
  trackEngagedTime?: boolean | EngagedTimeOptions;
}

/**
 * Configuration options for engaged-time tracking.
 * @experimental This feature is experimental and may not be stable.
 */
export interface EngagedTimeOptions {
  /** Rolling activity window in milliseconds. Defaults to 5,000. */
  engagementThresholdMillis?: number;
  /** Snapshot cadence in milliseconds. Defaults to 15,000; must be shorter than pageSessionTimeoutMillis. */
  heartbeatIntervalMillis?: number;
  /**
   * Finalize the page view after this many milliseconds without activity. Defaults to 180,000 (3 minutes).
   * The same duration is sent as the delayed request timeout for server-side fallback after the last accepted heartbeat.
   */
  pageSessionTimeoutMillis?: number;
}

export type PageTrackingTrackOn = 'attribution' | (() => boolean);

export type PageTrackingHistoryChanges = 'all' | 'pathOnly';
