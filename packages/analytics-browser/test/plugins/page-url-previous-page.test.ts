import { createInstance } from '@amplitude/analytics-browser';
import { getGlobalScope, Logger, UUID } from '@amplitude/analytics-core';
import { BrowserConfig, LogLevel } from '@amplitude/analytics-types';
import { CookieStorage, FetchTransport } from '@amplitude/analytics-client-common';
import { pageUrlPreviousPagePlugin } from '../../src/plugins/page-url-previous-page';

describe('pageUrlPreviousPagePlugin', () => {
  const mockConfig: BrowserConfig = {
    apiKey: UUID(),
    flushIntervalMillis: 0,
    flushMaxRetries: 0,
    flushQueueSize: 0,
    logLevel: LogLevel.None,
    loggerProvider: new Logger(),
    offline: false,
    optOut: false,
    serverUrl: undefined,
    transportProvider: new FetchTransport(),
    useBatch: false,
    cookieOptions: {
      domain: '.amplitude.com',
      expiration: 365,
      sameSite: 'Lax',
      secure: false,
      upgrade: true,
    },
    cookieStorage: new CookieStorage(),
    sessionTimeout: 30 * 60 * 1000,
    trackingOptions: {
      ipAddress: true,
      language: true,
      platform: true,
    },
    pageCounter: 0,
  };

  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: '',
        href: '',
        pathname: '',
        search: '',
      },
      writable: true,
    });
  });

  beforeEach(() => {
    (window.location as any) = {
      hostname: '',
      href: '',
      pathname: '',
      search: '',
    };
  });

  afterEach(() => {
    const sessionStorage = getGlobalScope()?.sessionStorage;
    sessionStorage?.removeItem('previousPage');
    sessionStorage?.removeItem('currentPage');
  });

  describe('setup', () => {
    test('should track page changes', async () => {
      const amplitude = createInstance();
      const plugin = pageUrlPreviousPagePlugin({ restrictToAutocapture: false });
      await plugin.setup?.(mockConfig, amplitude);
      const sessionStorage = getGlobalScope()?.sessionStorage;

      const firstURL = new URL('https://www.example.com/home');
      mockWindowLocationFromURL(firstURL);
      window.history.pushState(undefined, firstURL.href);

      expect(sessionStorage?.getItem('currentPage')).toBe('https://www.example.com/home');
      expect(sessionStorage?.getItem('previousPage')).toBe('');

      const secondURL = new URL('https://www.example.com/about');
      mockWindowLocationFromURL(secondURL);
      window.history.pushState(undefined, secondURL.href);

      expect(sessionStorage?.getItem('currentPage')).toBe('https://www.example.com/about');
      expect(sessionStorage?.getItem('previousPage')).toBe('https://www.example.com/home');

      const thirdURL = new URL('https://www.example.com/contact');
      mockWindowLocationFromURL(thirdURL);
      window.history.pushState(undefined, thirdURL.href);

      expect(sessionStorage?.getItem('currentPage')).toBe('https://www.example.com/contact');
      expect(sessionStorage?.getItem('previousPage')).toBe('https://www.example.com/about');

      await plugin.teardown?.();
    });
  });

  describe('execute', () => {
    test('should add additional Page URL and Previous Page properties to an event', async () => {
      const amplitude = createInstance();
      const plugin = pageUrlPreviousPagePlugin({ restrictToAutocapture: false });
      await plugin.setup?.(mockConfig, amplitude);

      const firstURL = new URL('https://www.example.com/home');
      mockWindowLocationFromURL(firstURL);
      mockDocumentTitle('Home - Example');
      window.history.pushState(undefined, firstURL.href);

      const secondURL = new URL('https://www.example.com/about?test=param');
      mockWindowLocationFromURL(secondURL);
      mockDocumentTitle('About - Example');
      window.history.pushState(undefined, secondURL.href);

      const event = await plugin.execute?.({
        event_type: 'test_event',
      });

      expect(event?.event_properties).toMatchObject({
        '[Amplitude] Page Domain': 'www.example.com',
        '[Amplitude] Page Location': 'https://www.example.com/about?test=param',
        '[Amplitude] Page Path': '/about',
        '[Amplitude] Page Title': 'About - Example',
        '[Amplitude] Page URL': 'https://www.example.com/about',
        '[Amplitude] Previous Page Location': 'https://www.example.com/home',
        '[Amplitude] Previous Page Type': 'internal',
      });

      await plugin.teardown?.();
    });

    test('should assign external to previous page type for non-matching domains', async () => {
      const amplitude = createInstance();
      const plugin = pageUrlPreviousPagePlugin({ restrictToAutocapture: false });
      await plugin.setup?.(mockConfig, amplitude);

      const firstURL = new URL('https://www.externalexample.com/home');
      mockWindowLocationFromURL(firstURL);
      mockDocumentTitle('HOME | External Example');
      window.history.pushState(undefined, firstURL.href);

      const secondURL = new URL('https://www.example.com/about?test=param');
      mockWindowLocationFromURL(secondURL);
      mockDocumentTitle('About - Example');
      window.history.pushState(undefined, secondURL.href);

      const event = await plugin.execute?.({
        event_type: 'test_event',
      });

      expect(event?.event_properties).toMatchObject({
        '[Amplitude] Page Domain': 'www.example.com',
        '[Amplitude] Page Location': 'https://www.example.com/about?test=param',
        '[Amplitude] Page Path': '/about',
        '[Amplitude] Page Title': 'About - Example',
        '[Amplitude] Page URL': 'https://www.example.com/about',
        '[Amplitude] Previous Page Location': 'https://www.externalexample.com/home',
        '[Amplitude] Previous Page Type': 'external',
      });

      await plugin.teardown?.();
    });

    test('should assign external to previous page type for subdomains', async () => {
      const amplitude = createInstance();
      const plugin = pageUrlPreviousPagePlugin({ restrictToAutocapture: false });
      await plugin.setup?.(mockConfig, amplitude);

      const firstURL = new URL('https://www.sub.example.com/home');
      mockWindowLocationFromURL(firstURL);
      window.history.pushState(undefined, firstURL.href);

      const secondURL = new URL('https://www.example.com/about?test=param');
      mockWindowLocationFromURL(secondURL);
      mockDocumentTitle('About - Example');
      window.history.pushState(undefined, secondURL.href);

      const event = await plugin.execute?.({
        event_type: 'test_event',
      });

      expect(event?.event_properties).toMatchObject({
        '[Amplitude] Page Domain': 'www.example.com',
        '[Amplitude] Page Location': 'https://www.example.com/about?test=param',
        '[Amplitude] Page Path': '/about',
        '[Amplitude] Page Title': 'About - Example',
        '[Amplitude] Page URL': 'https://www.example.com/about',
        '[Amplitude] Previous Page Location': 'https://www.sub.example.com/home',
        '[Amplitude] Previous Page Type': 'external',
      });

      await plugin.teardown?.();
    });

    test('should assign internal to previous page type for matching domains', async () => {
      const amplitude = createInstance();
      const plugin = pageUrlPreviousPagePlugin({ restrictToAutocapture: false });
      await plugin.setup?.(mockConfig, amplitude);

      const firstURL = new URL('https://www.example.com/home');
      mockWindowLocationFromURL(firstURL);
      window.history.pushState(undefined, firstURL.href);

      const secondURL = new URL('https://www.example.com/about?test=param');
      mockWindowLocationFromURL(secondURL);
      mockDocumentTitle('About - Example');
      window.history.pushState(undefined, secondURL.href);

      const event = await plugin.execute?.({
        event_type: 'test_event',
      });

      expect(event?.event_properties).toMatchObject({
        '[Amplitude] Page Domain': 'www.example.com',
        '[Amplitude] Page Location': 'https://www.example.com/about?test=param',
        '[Amplitude] Page Path': '/about',
        '[Amplitude] Page Title': 'About - Example',
        '[Amplitude] Page URL': 'https://www.example.com/about',
        '[Amplitude] Previous Page Location': 'https://www.example.com/home',
        '[Amplitude] Previous Page Type': 'internal',
      });

      await plugin.teardown?.();
    });

    test('should assign direct to previous page type for unknown missing domains', async () => {
      const amplitude = createInstance();
      const plugin = pageUrlPreviousPagePlugin({ restrictToAutocapture: false });
      await plugin.setup?.(mockConfig, amplitude);

      const firstURL = new URL('https://www.example.com/about?test=param');
      mockWindowLocationFromURL(firstURL);
      window.history.pushState(undefined, firstURL.href);

      const event = await plugin.execute?.({
        event_type: 'test_event',
      });

      expect(event?.event_properties).toMatchObject({
        '[Amplitude] Page Domain': 'www.example.com',
        '[Amplitude] Page Location': 'https://www.example.com/about?test=param',
        '[Amplitude] Page Path': '/about',
        '[Amplitude] Page Title': 'About - Example',
        '[Amplitude] Page URL': 'https://www.example.com/about',
        '[Amplitude] Previous Page Location': '',
        '[Amplitude] Previous Page Type': 'direct',
      });

      await plugin.teardown?.();
    });
  });

  describe('teardown', () => {
    test('should call remove listeners', async () => {
      const amplitude = createInstance();
      const removeEventListener = jest.spyOn(window, 'removeEventListener');
      const plugin = pageUrlPreviousPagePlugin({ restrictToAutocapture: false });
      await plugin.setup?.(mockConfig, amplitude);
      await plugin.teardown?.();
      expect(removeEventListener).toHaveBeenCalledTimes(1);
    });

    test('should call remove listeners without proxy', async () => {
      const removeEventListener = jest.spyOn(window, 'removeEventListener');
      const plugin = pageUrlPreviousPagePlugin({ restrictToAutocapture: false });
      await plugin.teardown?.();
      expect(removeEventListener).toHaveBeenCalledTimes(1);
    });
  });
});

const mockWindowLocationFromURL = (url: URL) => {
  window.location.href = url.toString();
  window.location.search = url.search;
  window.location.hostname = url.hostname;
  window.location.pathname = url.pathname;
};

const mockDocumentTitle = (title: string) => {
  document.title = title;
};
