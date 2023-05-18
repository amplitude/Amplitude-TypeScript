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

  return defaultTracking?.fileDownloads !== false;
};

export const isFormInteractionTrackingEnabled = (defaultTracking: DefaultTrackingOptions | boolean | undefined) => {
  if (typeof defaultTracking === 'boolean') {
    return defaultTracking;
  }

  return defaultTracking?.formInteractions !== false;
};

export const isPageViewTrackingEnabled = (defaultTracking: DefaultTrackingOptions | boolean | undefined) => {
  if (typeof defaultTracking === 'boolean') {
    return defaultTracking;
  }

  return defaultTracking?.pageViews !== false;
};

export const isSessionTrackingEnabled = (defaultTracking: DefaultTrackingOptions | boolean | undefined) => {
  if (typeof defaultTracking === 'boolean') {
    return defaultTracking;
  }

  return defaultTracking?.sessions !== false;
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

  return defaultTracking?.attribution !== false;
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
    excludeReferrers = config.defaultTracking.attribution.excludeReferrers;
    initialEmptyValue = config.defaultTracking.attribution.initialEmptyValue;
    resetSessionOnNewCampaign = config.defaultTracking.attribution.resetSessionOnNewCampaign;
  }

  return {
    excludeReferrers,
    initialEmptyValue,
    resetSessionOnNewCampaign,
  };
};
