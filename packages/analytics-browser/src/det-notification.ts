import { BrowserConfig } from '@amplitude/analytics-types';

let notified = false;

export const detNotify = (config: BrowserConfig): void => {
  if (notified || config.defaultTracking !== undefined) {
    return;
  }

  const message = `\`options.defaultTracking\` is set to undefined. This implicitly configures your Amplitude instance to track Page Views, Sessions, File Downloads, and Form Interactions. You can suppress this warning by explicitly setting a value to \`options.defaultTracking\`. The value must either be a boolean, to enable and disable all default events, or an object, for advanced configuration. For example:

amplitude.init(<YOUR_API_KEY>, {
  defaultTracking: true,
});

Visit https://www.docs.developers.amplitude.com/data/sdks/browser-2/#tracking-default-events for more details.`;
  config.loggerProvider.warn(message);
  notified = true;
};

/**
 * @private
 * This function is meant for testing purposes only
 */
export const resetNotify = () => {
  notified = false;
};
