import {
  isSessionTrackingEnabled,
  isFileDownloadTrackingEnabled,
  isFormInteractionTrackingEnabled,
  isPageViewTrackingEnabled,
} from '@amplitude/analytics-client-common';
import { BrowserConfig } from '@amplitude/analytics-types';

let notified = false;

export const detNotify = (config: BrowserConfig): void => {
  if (notified) {
    return;
  }

  const enabledTracking = [
    isPageViewTrackingEnabled(config.defaultTracking) ? 'Page Views' : '',
    isSessionTrackingEnabled(config.defaultTracking) ? 'Sessions' : '',
    isFileDownloadTrackingEnabled(config.defaultTracking) ? 'File Downloads' : '',
    isFormInteractionTrackingEnabled(config.defaultTracking) ? 'Form Interactions' : '',
  ].filter(Boolean);
  const enabledTrackingString = enabledTracking.join(', ');

  if (enabledTracking.length) {
    config.loggerProvider.log(
      `Your Amplitude instance is configured to track ${enabledTrackingString}. Visit https://www.docs.developers.amplitude.com/data/sdks/browser-2/#tracking-default-events for more details.`,
    );
  }
  notified = true;
};

/**
 * @private
 * This function is meant for testing purposes only
 */
export const resetNotify = () => {
  notified = false;
};
