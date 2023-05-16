import {
  BrowserOptions,
  DefaultTrackingOptions,
  PageTrackingHistoryChanges,
  PageTrackingOptions,
  PageTrackingTrackOn,
} from '@amplitude/analytics-types';

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

  if (
    defaultTracking?.pageViews === true ||
    (defaultTracking?.pageViews && typeof defaultTracking.pageViews === 'object')
  ) {
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

export const isAttributionTrackingEnabled = (defaultTracking: DefaultTrackingOptions | boolean | undefined) => {
  if (typeof defaultTracking === 'boolean') {
    return defaultTracking;
  }

  if (defaultTracking?.attribution) {
    return true;
  }

  return false;
};

export const getAttributionTrackingConfig = (
  config: BrowserOptions,
): {
  excludeReferrers?: string[];
  initialEmptyValue?: string;
  resetSessionOnNewCampaign?: boolean;
} => {
  let excludeReferrers: string[] | undefined;
  let initialEmptyValue: string | undefined;
  let resetSessionOnNewCampaign: boolean | undefined;

  if (
    isAttributionTrackingEnabled(config.defaultTracking) &&
    config.defaultTracking &&
    typeof config.defaultTracking === 'object' &&
    config.defaultTracking.attribution &&
    typeof config.defaultTracking.attribution === 'object'
  ) {
    if ('excludeReferrers' in config.defaultTracking.attribution) {
      excludeReferrers = config.defaultTracking.attribution.excludeReferrers;
    }

    if ('initialEmptyValue' in config.defaultTracking.attribution) {
      initialEmptyValue = config.defaultTracking.attribution.initialEmptyValue;
    }

    if ('resetSessionOnNewCampaign' in config.defaultTracking.attribution) {
      resetSessionOnNewCampaign = config.defaultTracking.attribution.resetSessionOnNewCampaign;
    }
  }

  return {
    excludeReferrers,
    initialEmptyValue,
    resetSessionOnNewCampaign,
  };
};
