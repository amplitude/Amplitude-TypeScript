export interface PageTrackingOptions {
  trackOn?: PageTrackingTrackOn;
  trackHistoryChanges?: PageTrackingHistoryChanges;
  eventType?: string;
  pageCounter?: number;
  /**
   * Delay page-view ingestion and attach cumulative engaged time. True or an options object enables it.
   * Only supported with the default trackOn (undefined). Custom callbacks and attribution disable engagement.
   * Engaged page views omit user_properties; send user-property updates with a separate identify call.
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

export type PageTrackingTrackOn = 'attribution' | (() => boolean);

export type PageTrackingHistoryChanges = 'all' | 'pathOnly';
