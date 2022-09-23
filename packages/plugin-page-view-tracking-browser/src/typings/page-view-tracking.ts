export interface Options {
  trackOn?: PageTrackingTrackOn;
  trackHistoryChanges?: PageTrackingHistoryChanges;
}

export type PageTrackingTrackOn = 'attribution' | (() => boolean);

export type PageTrackingHistoryChanges = 'all' | 'pathOnly';
