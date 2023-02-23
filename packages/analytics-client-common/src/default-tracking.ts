import { BrowserOptions, DefaultTrackingOptions } from '@amplitude/analytics-types';

export const isFileDownloadTrackingEnabled = (defaultTracking: DefaultTrackingOptions | boolean | undefined) => {
  if (typeof defaultTracking === 'boolean') {
    return defaultTracking;
  }

  if (defaultTracking?.fileDownloads) {
    return true;
  }

  return false;
};

export const isFormInteractionTrackingEnabled = (defaultTracking: DefaultTrackingOptions | boolean | undefined) => {
  if (typeof defaultTracking === 'boolean') {
    return defaultTracking;
  }

  if (defaultTracking?.formInteractions) {
    return true;
  }

  return false;
};

export const isPageViewTrackingEnabled = (defaultTracking: DefaultTrackingOptions | boolean | undefined) => {
  if (typeof defaultTracking === 'boolean') {
    return defaultTracking;
  }

  if (defaultTracking?.pageViews === true || typeof defaultTracking?.pageViews === 'object') {
    return true;
  }

  return false;
};

export const isSessionTrackingEnabled = (defaultTracking: DefaultTrackingOptions | boolean | undefined) => {
  if (typeof defaultTracking === 'boolean') {
    return defaultTracking;
  }

  if (defaultTracking?.sessions) {
    return true;
  }

  return false;
};

/**
 * Returns page view tracking config
 *
 * if config.attribution.trackPageViews and config.defaultTracking.pageViews are both TRUE
 * then always track page views
 *
 * if config.attribution.trackPageViews is TRUE and config.defaultTracking.pageViews is FALSE
 * then only track page views on attribution
 *
 * if config.attribution.trackPageViews is FALSE and config.defaultTracking.pageViews is TRUE
 * then always track page views
 *
 * if config.attribution.trackPageViews and config.defaultTracking.pageViews are both FALSE
 * then never track page views
 */
export const getPageViewTrackingConfig = (config: BrowserOptions) => {
  let trackOn: undefined | 'attribution' | (() => boolean) = config.attribution?.trackPageViews
    ? 'attribution'
    : () => false;
  let trackHistoryChanges: undefined | 'all' | 'pathOnly' = undefined;

  const isDefaultPageViewTrackingEnabled = isPageViewTrackingEnabled(config.defaultTracking);
  if (isDefaultPageViewTrackingEnabled) {
    trackOn = () => true;

    if (typeof config.defaultTracking === 'object' && typeof config.defaultTracking.pageViews === 'object') {
      if ('trackOn' in config.defaultTracking.pageViews) {
        trackOn = config.defaultTracking.pageViews.trackOn;
      }

      if ('trackHistoryChanges' in config.defaultTracking.pageViews) {
        trackHistoryChanges = config.defaultTracking.pageViews.trackHistoryChanges;
      }
    }
  }

  return {
    trackOn,
    trackHistoryChanges,
  };
};
