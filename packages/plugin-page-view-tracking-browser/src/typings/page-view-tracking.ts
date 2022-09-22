export interface Options {
  trackOn?: PageTrackingTrackOn;
}

export type PageTrackingTrackOn = 'attribution' | (() => boolean);
