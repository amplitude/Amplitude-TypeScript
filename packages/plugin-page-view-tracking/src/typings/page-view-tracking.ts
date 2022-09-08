export interface PageTrackingBrowserOptions {
  filter?: PageTrackingFilter;
}

export type PageTrackingFilter = 'onAttribution' | (() => boolean) | undefined;
