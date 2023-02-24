export interface PageTrackingOptions {
  trackOn?: PageTrackingTrackOn;
  trackHistoryChanges?: PageTrackingHistoryChanges;
  eventType?: string;
}

export type PageTrackingTrackOn = 'attribution' | (() => boolean);

export type PageTrackingHistoryChanges = 'all' | 'pathOnly';
