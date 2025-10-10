import {
  PageTrackingHistoryChanges,
  PageTrackingOptions,
  PageTrackingTrackOn,
  ElementInteractionsOptions,
  BrowserOptions,
  AutocaptureOptions,
  AttributionOptions,
  NetworkTrackingOptions,
  FrustrationInteractionsOptions,
} from '@amplitude/analytics-core';

/**
 * A subset of AutocaptureOptions that includes the autocapture features that
 * are made available to users by default (even if "config.autocapture === undefined")
 */
type AutocaptureOptionsDefaultAvailable = Pick<
  AutocaptureOptions,
  'pageViews' | 'sessions' | 'fileDownloads' | 'formInteractions' | 'attribution'
>;

/**
 * Returns false if autocapture === false or if autocapture[event],
 * otherwise returns true (even if "config.autocapture === undefined")
 */
const isTrackingEnabled = (
  autocapture: AutocaptureOptionsDefaultAvailable | boolean | undefined,
  event: keyof AutocaptureOptionsDefaultAvailable,
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

/**
 * Returns true if
 * 1. if autocapture.networkTracking === true
 * 2. if autocapture.networkTracking === object
 * otherwise returns false
 */
export const isNetworkTrackingEnabled = (autocapture: AutocaptureOptions | boolean | undefined) => {
  if (typeof autocapture === 'boolean') {
    return autocapture;
  }

  if (
    typeof autocapture === 'object' &&
    (autocapture.networkTracking === true || typeof autocapture.networkTracking === 'object')
  ) {
    return true;
  }

  return false;
};

/**
 * Returns true if
 * 1. autocapture === true
 * 2. if autocapture.elementInteractions === true
 * 3. if autocapture.elementInteractions === object
 * otherwise returns false
 */
export const isElementInteractionsEnabled = (autocapture: AutocaptureOptions | boolean | undefined): boolean => {
  if (typeof autocapture === 'boolean') {
    return autocapture;
  }

  if (
    typeof autocapture === 'object' &&
    (autocapture.elementInteractions === true || typeof autocapture.elementInteractions === 'object')
  ) {
    return true;
  }

  return false;
};

/**
 * Returns true if
 * 1. autocapture === true
 * 2. if autocapture.webVitals === true
 * otherwise returns false
 */
export const isWebVitalsEnabled = (autocapture: AutocaptureOptions | boolean | undefined): boolean => {
  // TODO restore this if statement when webVitals is GA
  // if (typeof autocapture === 'boolean') {
  //   return autocapture;
  // }

  if (typeof autocapture === 'object' && autocapture.webVitals === true) {
    return true;
  }

  return false;
};

export const isFrustrationInteractionsEnabled = (autocapture: AutocaptureOptions | boolean | undefined): boolean => {
  if (typeof autocapture === 'boolean') {
    return autocapture;
  }

  if (
    typeof autocapture === 'object' &&
    (autocapture.frustrationInteractions === true || typeof autocapture.frustrationInteractions === 'object')
  ) {
    return true;
  }

  return false;
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

export const getFrustrationInteractionsConfig = (
  config: BrowserOptions,
): FrustrationInteractionsOptions | undefined => {
  if (
    isFrustrationInteractionsEnabled(config.autocapture) &&
    typeof config.autocapture === 'object' &&
    typeof config.autocapture.frustrationInteractions === 'object'
  ) {
    return config.autocapture.frustrationInteractions;
  }
  return undefined;
};

export const getNetworkTrackingConfig = (config: BrowserOptions): NetworkTrackingOptions | undefined => {
  if (isNetworkTrackingEnabled(config.autocapture)) {
    let networkTrackingConfig;
    if (typeof config.autocapture === 'object' && typeof config.autocapture.networkTracking === 'object') {
      networkTrackingConfig = config.autocapture.networkTracking;
    } else if (config.networkTrackingOptions) {
      networkTrackingConfig = config.networkTrackingOptions;
    }
    return {
      ...networkTrackingConfig,
      captureRules: networkTrackingConfig?.captureRules?.map((rule) => {
        // if URLs and hosts are both set, URLs take precedence over hosts
        if (rule.urls?.length && rule.hosts?.length) {
          const hostsString = JSON.stringify(rule.hosts);
          const urlsString = JSON.stringify(rule.urls);
          /* istanbul ignore next */
          config.loggerProvider?.warn(
            `Found network capture rule with both urls='${urlsString}' and hosts='${hostsString}' set. ` +
              `Definition of urls takes precedence over hosts, so ignoring hosts.`,
          );
          return { ...rule, hosts: undefined };
        }
        return rule;
      }),
    };
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
