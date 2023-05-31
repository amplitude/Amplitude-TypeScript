import {
  AttributionOptions,
  BrowserOptions,
  DefaultTrackingOptions,
  PageTrackingHistoryChanges,
  PageTrackingOptions,
  PageTrackingTrackOn,
} from '@amplitude/analytics-types';

/**
 * Returns false if defaultTracking === false or if defaultTracking[event],
 * otherwise returns true
 */
const isTrackingEnabled = (
  defaultTracking: DefaultTrackingOptions | boolean | undefined,
  event: keyof DefaultTrackingOptions,
) => {
  if (typeof defaultTracking === 'boolean') {
    return defaultTracking;
  }

  if (defaultTracking?.[event] === false) {
    return false;
  }

  return true;
};

export const isAttributionTrackingEnabled = (defaultTracking: DefaultTrackingOptions | boolean | undefined) =>
  isTrackingEnabled(defaultTracking, 'attribution');

export const isFileDownloadTrackingEnabled = (defaultTracking: DefaultTrackingOptions | boolean | undefined) =>
  isTrackingEnabled(defaultTracking, 'fileDownloads');

export const isFormInteractionTrackingEnabled = (defaultTracking: DefaultTrackingOptions | boolean | undefined) =>
  isTrackingEnabled(defaultTracking, 'formInteractions');

export const isPageViewTrackingEnabled = (defaultTracking: DefaultTrackingOptions | boolean | undefined) =>
  isTrackingEnabled(defaultTracking, 'pageViews');

export const isSessionTrackingEnabled = (defaultTracking: DefaultTrackingOptions | boolean | undefined) =>
  isTrackingEnabled(defaultTracking, 'sessions');

export const getPageViewTrackingConfig = (config: BrowserOptions): PageTrackingOptions => {
  let trackOn: PageTrackingTrackOn | undefined = () => false;
  let trackHistoryChanges: PageTrackingHistoryChanges | undefined = undefined;
  let eventType: string | undefined;

  const isDefaultPageViewTrackingEnabled = isPageViewTrackingEnabled(config.defaultTracking);
  if (isDefaultPageViewTrackingEnabled) {
    trackOn = undefined;
    eventType = undefined;

    if (
      config.defaultTracking &&
      typeof config.defaultTracking === 'object' &&
      config.defaultTracking.pageViews &&
      typeof config.defaultTracking.pageViews === 'object'
    ) {
      if ('trackOn' in config.defaultTracking.pageViews) {
        trackOn = config.defaultTracking.pageViews.trackOn;
      }

      if ('trackHistoryChanges' in config.defaultTracking.pageViews) {
        trackHistoryChanges = config.defaultTracking.pageViews.trackHistoryChanges;
      }

      if ('eventType' in config.defaultTracking.pageViews && config.defaultTracking.pageViews.eventType) {
        eventType = config.defaultTracking.pageViews.eventType;
      }
    }
  }

  return {
    trackOn,
    trackHistoryChanges,
    eventType,
  };
};

export const getAttributionTrackingConfig = (config: BrowserOptions): AttributionOptions => {
  if (
    isAttributionTrackingEnabled(config.defaultTracking) &&
    config.defaultTracking &&
    typeof config.defaultTracking === 'object' &&
    config.defaultTracking.attribution &&
    typeof config.defaultTracking.attribution === 'object'
  ) {
    return {
      ...config.defaultTracking.attribution,
    };
  }

  return {};
};
