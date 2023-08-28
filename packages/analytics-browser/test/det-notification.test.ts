jest.unmock('../src/det-notification');

import { detNotify, resetNotify } from '../src/det-notification';
import { BrowserConfig } from '../src/config';
import { UUID } from '@amplitude/analytics-core';

describe('detNotify', () => {
  let apiKey = '';

  afterAll(() => {
    jest.mock('../src/det-notification');
  });

  beforeEach(() => {
    apiKey = UUID();
    resetNotify();
  });

  test('should handle undefined config', () => {
    const config = new BrowserConfig(apiKey);
    const warn = jest.spyOn(config.loggerProvider, 'warn').mockImplementationOnce(() => undefined);
    detNotify(config);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      `\`options.defaultTracking\` is set to undefined. This implicitly configures your Amplitude instance to track Page Views, Sessions, File Downloads, and Form Interactions. You can suppress this warning by explicitly setting a value to \`options.defaultTracking\`. The value must either be a boolean, to enable and disable all default events, or an object, for advanced configuration. For example:

amplitude.init(<YOUR_API_KEY>, {
  defaultTracking: true,
});

Visit https://www.docs.developers.amplitude.com/data/sdks/browser-2/#tracking-default-events for more details.`,
    );
  });

  test('should handle duplicate calls', () => {
    const config = new BrowserConfig(apiKey);
    const warn = jest.spyOn(config.loggerProvider, 'warn').mockImplementationOnce(() => undefined);
    detNotify(config);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      `\`options.defaultTracking\` is set to undefined. This implicitly configures your Amplitude instance to track Page Views, Sessions, File Downloads, and Form Interactions. You can suppress this warning by explicitly setting a value to \`options.defaultTracking\`. The value must either be a boolean, to enable and disable all default events, or an object, for advanced configuration. For example:

amplitude.init(<YOUR_API_KEY>, {
  defaultTracking: true,
});

Visit https://www.docs.developers.amplitude.com/data/sdks/browser-2/#tracking-default-events for more details.`,
    );

    detNotify(config);
    // call count still at 1
    expect(warn).toHaveBeenCalledTimes(1);
  });

  test('should handle defined config', () => {
    const config = new BrowserConfig(apiKey, undefined, undefined, undefined, true);
    const warn = jest.spyOn(config.loggerProvider, 'warn').mockImplementationOnce(() => undefined);
    detNotify(config);
    expect(warn).toHaveBeenCalledTimes(0);
  });
});
