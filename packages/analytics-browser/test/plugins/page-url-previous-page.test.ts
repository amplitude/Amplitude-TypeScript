import { createAmplitudeMock, createConfigurationMock } from '../helpers/mock';
import { getGlobalScope } from '@amplitude/analytics-core';
import { BrowserConfig } from '@amplitude/analytics-types/';
import { pageUrlPreviousPagePlugin } from '../../src/plugins/page-url-previous-page';

describe('pageUrlPreviousPagePlugin', () => {
  let mockConfig: BrowserConfig = createConfigurationMock();
  let amplitude = createAmplitudeMock();
  const plugin = pageUrlPreviousPagePlugin();

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
    amplitude = createAmplitudeMock();
    mockConfig = createConfigurationMock();

    (window.location as any) = {
      hostname: '',
      href: '',
      pathname: '',
      search: '',
    };
  });

  afterEach(async () => {
    await plugin.teardown?.();
  });

  describe('setup', () => {
    test('should track page changes if we move to a new page', async () => {
      await plugin.setup?.(mockConfig, amplitude);
      const sessionStorage = getGlobalScope()?.sessionStorage;
      const history = getGlobalScope()?.history;

      // test falsey location href
      history?.pushState(undefined, '');
      expect(sessionStorage?.getItem('currentPage')).toBe('');
      expect(sessionStorage?.getItem('previousPage')).toBe('');

      const firstURL = new URL('https://www.example.com/home');
      mockWindowLocationFromURL(firstURL);
      history?.pushState(undefined, firstURL.href);
      expect(sessionStorage?.getItem('currentPage')).toBe('https://www.example.com/home');
      expect(sessionStorage?.getItem('previousPage')).toBe('');

      const secondURL = new URL('https://www.example.com/about');
      mockWindowLocationFromURL(secondURL);
      history?.pushState(undefined, secondURL.href);
      expect(sessionStorage?.getItem('currentPage')).toBe('https://www.example.com/about');
      expect(sessionStorage?.getItem('previousPage')).toBe('https://www.example.com/home');

      const thirdURL = new URL('https://www.example.com/contact');
      mockWindowLocationFromURL(thirdURL);
      history?.pushState(undefined, thirdURL.href);
      expect(sessionStorage?.getItem('currentPage')).toBe('https://www.example.com/contact');
      expect(sessionStorage?.getItem('previousPage')).toBe('https://www.example.com/about');

      await plugin.teardown?.();
    });

    test('should track page changes if we go back a page', async () => {
      await plugin.setup?.(mockConfig, amplitude);
      const sessionStorage = getGlobalScope()?.sessionStorage;
      const history = getGlobalScope()?.history;

      const firstURL = new URL('https://www.example.com/1');
      mockWindowLocationFromURL(firstURL);
      history?.pushState(undefined, firstURL.href);
      expect(sessionStorage?.getItem('currentPage')).toBe('https://www.example.com/1');
      expect(sessionStorage?.getItem('previousPage')).toBe('');

      const secondURL = new URL('https://www.example.com/2');
      mockWindowLocationFromURL(secondURL);
      history?.pushState(undefined, secondURL.href);
      expect(sessionStorage?.getItem('currentPage')).toBe('https://www.example.com/2');
      expect(sessionStorage?.getItem('previousPage')).toBe('https://www.example.com/1');

      history?.back();

      setTimeout(() => {
        expect(sessionStorage?.getItem('currentPage')).toBe('https://www.example.com/1');
        expect(sessionStorage?.getItem('previousPage')).toBe('https://www.example.com/2');
      }, 1000);

      await plugin.teardown?.();
    });
  });

  describe('execute', () => {
    test('should add additional Page URL and Previous Page properties to an event', async () => {
      await plugin.setup?.(mockConfig, amplitude);

      // test falsey location href
      history?.pushState(undefined, '');
      const event_1 = await plugin.execute?.({
        event_type: 'test_event_1',
      });

      expect(event_1?.event_properties).toMatchObject({
        '[Amplitude] Page Domain': '',
        '[Amplitude] Page Location': '',
        '[Amplitude] Page Path': '',
        '[Amplitude] Page Title': '',
        '[Amplitude] Page URL': '',
        '[Amplitude] Previous Page Location': '',
        '[Amplitude] Previous Page Type': 'direct',
      });

      const firstURL = new URL('https://www.example.com/home');
      mockWindowLocationFromURL(firstURL);
      mockDocumentTitle('Home - Example');
      window.history.pushState(undefined, firstURL.href);

      const secondURL = new URL('https://www.example.com/about?test=param');
      mockWindowLocationFromURL(secondURL);
      mockDocumentTitle('About - Example');
      window.history.pushState(undefined, secondURL.href);

      const event_2 = await plugin.execute?.({
        event_type: 'test_event_2',
      });

      expect(event_2?.event_properties).toMatchObject({
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
      const removeEventListener = jest.spyOn(window, 'removeEventListener');
      await plugin.setup?.(mockConfig, amplitude);
      await plugin.teardown?.();
      expect(removeEventListener).toHaveBeenCalledTimes(1);
    });

    test('should call remove listeners without proxy', async () => {
      const removeEventListener = jest.spyOn(window, 'removeEventListener');
      await plugin.teardown?.();
      expect(removeEventListener).toHaveBeenCalledTimes(1);
    });

    test('sessionStorage items should be removed', async () => {
      const sessionStorage = getGlobalScope()?.sessionStorage;
      await plugin.setup?.(mockConfig, amplitude);
      sessionStorage?.setItem('currentPage', 'test1');
      sessionStorage?.setItem('previousPage', 'test2');

      await plugin.teardown?.();
      expect(sessionStorage?.getItem('currentPage')).toBe(null);
      expect(sessionStorage?.getItem('previousPage')).toBe(null);
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
