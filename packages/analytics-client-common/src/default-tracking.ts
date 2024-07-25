import {
  AttributionOptions,
  AutocaptureOptions,
  BrowserOptions,
  PageTrackingHistoryChanges,
  PageTrackingOptions,
  PageTrackingTrackOn,
  UserInteractionsOptions,
} from '@amplitude/analytics-types';

/**
 * Returns false if autocapture === false or if autocapture[event],
 * otherwise returns true
 */
const isTrackingEnabled = (autocapture: AutocaptureOptions | boolean | undefined, event: keyof AutocaptureOptions) => {
  if (typeof autocapture === 'boolean') {
    return autocapture;
  }

  if (autocapture?.[event] === false) {
    return false;
  }

  return true;
};

export const isAttributionTrackingEnabled = (autocapture: AutocaptureOptions | boolean | undefined) =>
  isTrackingEnabled(autocapture, 'attribution');

export const isFileDownloadTrackingEnabled = (autocapture: AutocaptureOptions | boolean | undefined) =>
  isTrackingEnabled(autocapture, 'fileDownloads');

export const isFormInteractionTrackingEnabled = (autocapture: AutocaptureOptions | boolean | undefined) =>
  isTrackingEnabled(autocapture, 'formInteractions');

export const isPageViewTrackingEnabled = (autocapture: AutocaptureOptions | boolean | undefined) =>
  isTrackingEnabled(autocapture, 'pageViews');

export const isSessionTrackingEnabled = (autocapture: AutocaptureOptions | boolean | undefined) =>
  isTrackingEnabled(autocapture, 'sessions');

/**
 * Returns true if
 * 1. autocapture === true
 * 2. if autocapture.userInteractions === true
 * 3. if autocapture.userInteractions === object
 * otherwise returns false
 */
export const isUserInteractionsEnabled = (autocapture: AutocaptureOptions | boolean | undefined): boolean => {
  if (typeof autocapture === 'boolean') {
    return autocapture;
  }

  if (
    typeof autocapture === 'object' &&
    (autocapture.userInteractions === true || typeof autocapture.userInteractions === 'object')
  ) {
    return true;
  }

  return false;
};

export const getUserInteractionsConfig = (config: BrowserOptions): UserInteractionsOptions | undefined => {
  if (
    isUserInteractionsEnabled(config.autocapture) &&
    typeof config.autocapture === 'object' &&
    typeof config.autocapture.userInteractions === 'object'
  ) {
    return config.autocapture.userInteractions;
  }
  return undefined;
};

export const getPageViewTrackingConfig = (config: BrowserOptions): PageTrackingOptions => {
  let trackOn: PageTrackingTrackOn | undefined = () => false;
  let trackHistoryChanges: PageTrackingHistoryChanges | undefined = undefined;
  let eventType: string | undefined;
  const pageCounter = config.pageCounter;

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
    pageCounter,
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
