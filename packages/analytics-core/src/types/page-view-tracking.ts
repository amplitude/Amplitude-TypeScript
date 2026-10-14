export interface PageTrackingOptions {
  trackOn?: PageTrackingTrackOn;
  trackHistoryChanges?: PageTrackingHistoryChanges;
  eventType?: string;
  pageCounter?: number;
  /** Delay page-view ingestion and attach cumulative engaged time. True or an options object enables it; defaults to false. */
  trackEngagedTime?: boolean | EngagedTimeOptions;
}

export interface EngagedTimeOptions {
  /** Rolling activity window in milliseconds. Defaults to 5,000. */
  engagementThresholdMillis?: number;
  /** Snapshot cadence in milliseconds. Defaults to 15,000; must be shorter than pageSessionTimeoutMillis. */
  heartbeatIntervalMillis?: number;
  /** Finalize after this many milliseconds without activity. Also sets the service fallback TTL. Defaults to 180,000. */
  pageSessionTimeoutMillis?: number;
}

export type PageTrackingTrackOn = 'attribution' | (() => boolean);

export type PageTrackingHistoryChanges = 'all' | 'pathOnly';
