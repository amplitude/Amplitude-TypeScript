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

  if (defaultTracking?.pageViews) {
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
  let trackOn = config.attribution?.trackPageViews ? ('attribution' as const) : () => false;

  const isDefaultPageViewTrackingEnabled = isPageViewTrackingEnabled(config.defaultTracking);
  if (isDefaultPageViewTrackingEnabled) {
    trackOn = () => true;
  }

  return {
    trackOn,
  };
};
