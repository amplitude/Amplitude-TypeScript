import { BrowserOptions, AutoTrackingOptions } from '@amplitude/analytics-types';

export const isFileDownloadTrackingEnabled = (autoTracking: AutoTrackingOptions | boolean | undefined) => {
  if (typeof autoTracking === 'boolean') {
    return autoTracking;
  }

  if (autoTracking?.fileDownloads) {
    return true;
  }

  return false;
};

export const isFormInteractionTrackingEnabled = (autoTracking: AutoTrackingOptions | boolean | undefined) => {
  if (typeof autoTracking === 'boolean') {
    return autoTracking;
  }

  if (autoTracking?.formInteractions) {
    return true;
  }

  return false;
};

export const isPageViewTrackingEnabled = (autoTracking: AutoTrackingOptions | boolean | undefined) => {
  if (typeof autoTracking === 'boolean') {
    return autoTracking;
  }

  if (autoTracking?.pageViews) {
    return true;
  }

  return false;
};

export const isSessionTrackingEnabled = (autoTracking: AutoTrackingOptions | boolean | undefined) => {
  if (typeof autoTracking === 'boolean') {
    return autoTracking;
  }

  if (autoTracking?.sessions) {
    return true;
  }

  return false;
};

/**
 * Returns page view tracking config
 *
 * if config.attribution.trackPageViews and config.autoTracking.pageViews are both TRUE
 * then always track page views
 *
 * if config.attribution.trackPageViews is TRUE and config.autoTracking.pageViews is FALSE
 * then only track page views on attribution
 *
 * if config.attribution.trackPageViews is FALSE and config.autoTracking.pageViews is TRUE
 * then always track page views
 *
 * if config.attribution.trackPageViews and config.autoTracking.pageViews are both FALSE
 * then never track page views
 */
export const getPageViewTrackingConfig = (config: BrowserOptions) => {
  let trackOn = config.attribution?.trackPageViews ? ('attribution' as const) : () => false;

  const isDefaultPageViewTrackingEnabled = isPageViewTrackingEnabled(config.autoTracking);
  if (isDefaultPageViewTrackingEnabled) {
    trackOn = () => true;
  }

  return {
    trackOn,
  };
};
