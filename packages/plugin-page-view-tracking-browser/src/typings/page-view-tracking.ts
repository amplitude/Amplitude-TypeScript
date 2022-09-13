export interface PageTrackingBrowserOptions {
  trackOn?: PageTrackingTrackOn;
}

export type PageTrackingTrackOn = 'attribution' | (() => boolean);
