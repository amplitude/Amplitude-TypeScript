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

  test('should handle all enabled', () => {
    const config = new BrowserConfig(apiKey);
    const warn = jest.spyOn(config.loggerProvider, 'log').mockImplementationOnce(() => undefined);
    detNotify(config);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Your Amplitude instance is configured to track Page Views, Sessions, File Downloads, Form Interactions. Visit https://www.docs.developers.amplitude.com/data/sdks/browser-2/#tracking-default-events for more details.',
    );
  });

  test('should duplicate calls', () => {
    const config = new BrowserConfig(apiKey, undefined, undefined, undefined, true);
    const warn = jest.spyOn(config.loggerProvider, 'log').mockImplementationOnce(() => undefined);

    /**
     * Duplicate calls
     */
    detNotify(config);
    detNotify(config);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Your Amplitude instance is configured to track Page Views, Sessions, File Downloads, Form Interactions. Visit https://www.docs.developers.amplitude.com/data/sdks/browser-2/#tracking-default-events for more details.',
    );
  });

  test('should handle partially enabled', () => {
    const config = new BrowserConfig(apiKey, undefined, undefined, undefined, {
      attribution: false,
      fileDownloads: false,
      formInteractions: false,
      // Partially enabled
      pageViews: true,
      sessions: false,
    });
    const warn = jest.spyOn(config.loggerProvider, 'log').mockImplementationOnce(() => undefined);
    detNotify(config);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Your Amplitude instance is configured to track Page Views. Visit https://www.docs.developers.amplitude.com/data/sdks/browser-2/#tracking-default-events for more details.',
    );
  });

  test('should handle all disabled', () => {
    const config = new BrowserConfig(apiKey, undefined, undefined, undefined, false);
    const warn = jest.spyOn(config.loggerProvider, 'log').mockImplementationOnce(() => undefined);
    detNotify(config);
    expect(warn).toHaveBeenCalledTimes(0);
  });
});
