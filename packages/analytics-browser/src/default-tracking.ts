import {
  PageTrackingHistoryChanges,
  PageTrackingOptions,
  PageTrackingTrackOn,
  ElementInteractionsOptions,
  BrowserOptions,
  AutocaptureOptions,
  AttributionOptions,
  NetworkTrackingOptions,
} from '@amplitude/analytics-core';

interface AutocaptureOptionsDefaultTracking {
  attribution?: boolean | AttributionOptions;
  fileDownloads?: boolean;
  formInteractions?: boolean;
  pageViews?: boolean | PageTrackingOptions;
  sessions?: boolean;
}

/**
 * Returns false if autocapture === false or if autocapture[event],
 * otherwise returns true
 *
 * This is for the following events:
 * 1. attribution
 * 2. fileDownloads
 * 3. formInteractions
 * 4. pageViews
 * 5. sessions
 *
 * All other events should be handled by isAutocaptureEventEnabled
 */
const isTrackingEnabled = (
  autocapture: AutocaptureOptionsDefaultTracking | boolean | undefined,
  event: keyof AutocaptureOptionsDefaultTracking,
) => {
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

type AutocaptureOptionsNonDefault = Omit<AutocaptureOptions, keyof AutocaptureOptionsDefaultTracking>;

/**
 * Returns true if
 */
const isAutocaptureEventEnabled = (
  autocapture: AutocaptureOptionsNonDefault | boolean | undefined,
  event: keyof AutocaptureOptionsNonDefault,
) => {
  if (typeof autocapture === 'boolean') {
    return autocapture;
  }

  if (typeof autocapture === 'object' && (autocapture[event] === true || typeof autocapture[event] === 'object')) {
    return true;
  }

  return false;
};

/**
 * Returns true if
 * 1. autocapture === true
 * 2. if autocapture.networkTracking === true
 * 3. if autocapture.networkTracking === object
 * otherwise returns false
 */
export const isNetworkTrackingEnabled = (autocapture: AutocaptureOptions | boolean | undefined) => {
  return isAutocaptureEventEnabled(autocapture, 'networkTracking');
};

/**
 * Returns true if
 * 1. autocapture === true
 * 2. if autocapture.elementInteractions === true
 * 3. if autocapture.elementInteractions === object
 * otherwise returns false
 */
export const isElementInteractionsEnabled = (autocapture: AutocaptureOptions | boolean | undefined): boolean => {
  return isAutocaptureEventEnabled(autocapture, 'elementInteractions');
};

export const getElementInteractionsConfig = (config: BrowserOptions): ElementInteractionsOptions | undefined => {
  if (
    isElementInteractionsEnabled(config.autocapture) &&
    typeof config.autocapture === 'object' &&
    typeof config.autocapture.elementInteractions === 'object'
  ) {
    return config.autocapture.elementInteractions;
  }
  return undefined;
};

export const getNetworkTrackingConfig = (config: BrowserOptions): NetworkTrackingOptions | undefined => {
  if (isNetworkTrackingEnabled(config.autocapture) && config.networkTrackingOptions) {
    return config.networkTrackingOptions;
  }
  return;
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
