import { createAmplitudeMock, createConfigurationMock } from '../helpers/mock';
import { getGlobalScope } from '@amplitude/analytics-core';
import { BrowserConfig } from '@amplitude/analytics-types/';
import {
  CURRENT_PAGE_STORAGE_KEY,
  pageUrlPreviousPagePlugin,
  PREVIOUS_PAGE_STORAGE_KEY,
  URL_INFO_STORAGE_KEY,
} from '../../src/plugins/page-url-previous-page';

describe('pageUrlPreviousPagePlugin', () => {
  let mockConfig: BrowserConfig = createConfigurationMock();
  let mockAmplitude = createAmplitudeMock();
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
    mockAmplitude = createAmplitudeMock();
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
      await plugin.setup?.(mockConfig, mockAmplitude);
      const sessionStorage = getGlobalScope()?.sessionStorage;
      const history = getGlobalScope()?.history;

      // test falsy location href
      history?.pushState(undefined, '');
      const falsyUrlInfo = {
        [CURRENT_PAGE_STORAGE_KEY]: '',
        [PREVIOUS_PAGE_STORAGE_KEY]: '',
      };
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));
      const storedFalsyUrlInfo = sessionStorage?.getItem(URL_INFO_STORAGE_KEY) || '';
      expect(JSON.parse(storedFalsyUrlInfo)).toStrictEqual(falsyUrlInfo);

      // move to first url
      const firstUrl = new URL('https://www.example.com/home');
      mockWindowLocationFromURL(firstUrl);
      history?.pushState(undefined, firstUrl.href);
      const firstUrlInfo = {
        [CURRENT_PAGE_STORAGE_KEY]: 'https://www.example.com/home',
        [PREVIOUS_PAGE_STORAGE_KEY]: '',
      };
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));
      const storedFirstUrlInfo = sessionStorage?.getItem(URL_INFO_STORAGE_KEY) || '';
      expect(JSON.parse(storedFirstUrlInfo)).toStrictEqual(firstUrlInfo);

      // move to second url
      const secondUrl = new URL('https://www.example.com/about');
      mockWindowLocationFromURL(secondUrl);
      history?.pushState(undefined, secondUrl.href);
      const secondUrlInfo = {
        [CURRENT_PAGE_STORAGE_KEY]: 'https://www.example.com/about',
        [PREVIOUS_PAGE_STORAGE_KEY]: 'https://www.example.com/home',
      };
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));
      const storedSecondUrlInfo = sessionStorage?.getItem(URL_INFO_STORAGE_KEY) || '';
      expect(JSON.parse(storedSecondUrlInfo)).toStrictEqual(secondUrlInfo);

      // move to third url
      const thirdUrl = new URL('https://www.example.com/contact');
      mockWindowLocationFromURL(thirdUrl);
      history?.pushState(undefined, thirdUrl.href);
      const thirdUrlInfo = {
        [CURRENT_PAGE_STORAGE_KEY]: 'https://www.example.com/contact',
        [PREVIOUS_PAGE_STORAGE_KEY]: 'https://www.example.com/about',
      };
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));
      const storedThirdUrlInfo = sessionStorage?.getItem(URL_INFO_STORAGE_KEY) || '';
      expect(JSON.parse(storedThirdUrlInfo)).toStrictEqual(thirdUrlInfo);
    });

    test('should track page changes if we replace state', async () => {
      await plugin.setup?.(mockConfig, mockAmplitude);
      const sessionStorage = getGlobalScope()?.sessionStorage;
      const history = getGlobalScope()?.history;

      // move to first url
      const firstUrl = new URL('https://www.example.com/home');
      mockWindowLocationFromURL(firstUrl);
      history?.pushState(undefined, firstUrl.href);
      const firstUrlInfo = {
        [CURRENT_PAGE_STORAGE_KEY]: 'https://www.example.com/home',
        [PREVIOUS_PAGE_STORAGE_KEY]: '',
      };
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));
      const urlInfoStr = sessionStorage?.getItem(URL_INFO_STORAGE_KEY) || '';
      expect(JSON.parse(urlInfoStr)).toStrictEqual(firstUrlInfo);

      // move to second url
      const secondUrl = new URL('https://www.example.com/about');
      mockWindowLocationFromURL(secondUrl);
      history?.replaceState(undefined, secondUrl.href);
      const secondUrlInfo = {
        [CURRENT_PAGE_STORAGE_KEY]: 'https://www.example.com/about',
        [PREVIOUS_PAGE_STORAGE_KEY]: 'https://www.example.com/home',
      };
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));
      const storedSecondUrlInfo = sessionStorage?.getItem(URL_INFO_STORAGE_KEY) || '';
      expect(JSON.parse(storedSecondUrlInfo)).toStrictEqual(secondUrlInfo);

      // move to third url
      const thirdUrl = new URL('https://www.example.com/contact');
      mockWindowLocationFromURL(thirdUrl);
      history?.pushState(undefined, thirdUrl.href);
      const thirdUrlInfo = {
        [CURRENT_PAGE_STORAGE_KEY]: 'https://www.example.com/contact',
        [PREVIOUS_PAGE_STORAGE_KEY]: 'https://www.example.com/about',
      };
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));
      const storedThirdUrlInfo = sessionStorage?.getItem(URL_INFO_STORAGE_KEY) || '';
      expect(JSON.parse(storedThirdUrlInfo)).toStrictEqual(thirdUrlInfo);
    });

    test('should track page changes if we go back a page', async () => {
      await plugin.setup?.(mockConfig, mockAmplitude);
      const sessionStorage = getGlobalScope()?.sessionStorage;
      const history = getGlobalScope()?.history;
      // move to first url
      const firstUrl = new URL('https://www.example.com/1');
      mockWindowLocationFromURL(firstUrl);
      history?.pushState(undefined, firstUrl.href);
      const firstUrlInfo = {
        [CURRENT_PAGE_STORAGE_KEY]: 'https://www.example.com/1',
        [PREVIOUS_PAGE_STORAGE_KEY]: '',
      };
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));
      const firstUrlInfoStr = sessionStorage?.getItem(URL_INFO_STORAGE_KEY) || '';
      expect(JSON.parse(firstUrlInfoStr)).toStrictEqual(firstUrlInfo);

      // move to second url
      const secondUrl = new URL('https://www.example.com/2');
      mockWindowLocationFromURL(secondUrl);
      history?.pushState(undefined, secondUrl.href);
      const secondUrlInfo = {
        [CURRENT_PAGE_STORAGE_KEY]: 'https://www.example.com/2',
        [PREVIOUS_PAGE_STORAGE_KEY]: 'https://www.example.com/1',
      };
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));
      const secondUrlInfoStr = sessionStorage?.getItem(URL_INFO_STORAGE_KEY) || '';
      expect(JSON.parse(secondUrlInfoStr)).toStrictEqual(secondUrlInfo);

      // go back
      // history?.back();
      // const popStateEvent = new PopStateEvent('popstate', { state: null });
      // dispatchEvent(popStateEvent);
      // const backtrackedUrlInfo = {
      //   [CURRENT_PAGE_STORAGE_KEY]: 'https://www.example.com/1',
      //   [PREVIOUS_PAGE_STORAGE_KEY]: 'https://www.example.com/2',
      // };
      // // block event loop so that the sessionStorage is updated since popstate is async
      // await new Promise((resolve) => setTimeout(resolve, 0));

      // const backtrackedUrlInfoStr = sessionStorage?.getItem(URL_INFO_STORAGE_KEY) || '';
      // expect(JSON.parse(backtrackedUrlInfoStr)).toStrictEqual(backtrackedUrlInfo);
    });
  });

  describe('execute', () => {
    test('should add additional Page URL and Previous Page properties to an event', async () => {
      await plugin.setup?.(mockConfig, mockAmplitude);

      // test falsy location href
      history?.pushState(undefined, '');
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event_1 = await plugin.execute?.({
        event_type: 'test_event_1',
      });

      expect(event_1?.event_properties).toStrictEqual({
        '[Amplitude] Page Domain': '',
        '[Amplitude] Page Location': '',
        '[Amplitude] Page Path': '',
        '[Amplitude] Page Title': '',
        '[Amplitude] Page URL': '',
        '[Amplitude] Previous Page Location': '',
        '[Amplitude] Previous Page Type': 'direct',
      });

      const firstUrl = new URL('https://www.example.com/home');
      mockWindowLocationFromURL(firstUrl);
      mockDocumentTitle('Home - Example');
      window.history.pushState(undefined, firstUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const secondUrl = new URL('https://www.example.com/about?test=param');
      mockWindowLocationFromURL(secondUrl);
      mockDocumentTitle('About - Example');
      window.history.pushState(undefined, secondUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event_2 = await plugin.execute?.({
        event_type: 'test_event_2',
      });

      expect(event_2?.event_properties).toStrictEqual({
        '[Amplitude] Page Domain': 'www.example.com',
        '[Amplitude] Page Location': 'https://www.example.com/about?test=param',
        '[Amplitude] Page Path': '/about',
        '[Amplitude] Page Title': 'About - Example',
        '[Amplitude] Page URL': 'https://www.example.com/about',
        '[Amplitude] Previous Page Location': 'https://www.example.com/home',
        '[Amplitude] Previous Page Type': 'internal',
      });
    });

    test('should assign external to previous page type for non-matching domains', async () => {
      await plugin.setup?.(mockConfig, mockAmplitude);

      const firstUrl = new URL('https://www.externalexample.com/home');
      mockWindowLocationFromURL(firstUrl);
      mockDocumentTitle('HOME | External Example');
      window.history.pushState(undefined, firstUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const secondUrl = new URL('https://www.example.com/about?test=param');
      mockWindowLocationFromURL(secondUrl);
      mockDocumentTitle('About - Example');
      window.history.pushState(undefined, secondUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event = await plugin.execute?.({
        event_type: 'test_event',
      });

      expect(event?.event_properties).toStrictEqual({
        '[Amplitude] Page Domain': 'www.example.com',
        '[Amplitude] Page Location': 'https://www.example.com/about?test=param',
        '[Amplitude] Page Path': '/about',
        '[Amplitude] Page Title': 'About - Example',
        '[Amplitude] Page URL': 'https://www.example.com/about',
        '[Amplitude] Previous Page Location': 'https://www.externalexample.com/home',
        '[Amplitude] Previous Page Type': 'external',
      });
    });

    test('should assign external to previous page type for subdomains', async () => {
      await plugin.setup?.(mockConfig, mockAmplitude);

      const firstUrl = new URL('https://www.sub.example.com/home');
      mockWindowLocationFromURL(firstUrl);
      window.history.pushState(undefined, firstUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const secondUrl = new URL('https://www.example.com/about?test=param');
      mockWindowLocationFromURL(secondUrl);
      mockDocumentTitle('About - Example');
      window.history.pushState(undefined, secondUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event = await plugin.execute?.({
        event_type: 'test_event',
      });

      expect(event?.event_properties).toStrictEqual({
        '[Amplitude] Page Domain': 'www.example.com',
        '[Amplitude] Page Location': 'https://www.example.com/about?test=param',
        '[Amplitude] Page Path': '/about',
        '[Amplitude] Page Title': 'About - Example',
        '[Amplitude] Page URL': 'https://www.example.com/about',
        '[Amplitude] Previous Page Location': 'https://www.sub.example.com/home',
        '[Amplitude] Previous Page Type': 'external',
      });
    });

    test('should assign internal to previous page type for matching domains', async () => {
      await plugin.setup?.(mockConfig, mockAmplitude);

      const firstUrl = new URL('https://www.example.com/home');
      mockWindowLocationFromURL(firstUrl);
      window.history.pushState(undefined, firstUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const secondUrl = new URL('https://www.example.com/about?test=param');
      mockWindowLocationFromURL(secondUrl);
      mockDocumentTitle('About - Example');
      window.history.pushState(undefined, secondUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event = await plugin.execute?.({
        event_type: 'test_event',
      });

      expect(event?.event_properties).toStrictEqual({
        '[Amplitude] Page Domain': 'www.example.com',
        '[Amplitude] Page Location': 'https://www.example.com/about?test=param',
        '[Amplitude] Page Path': '/about',
        '[Amplitude] Page Title': 'About - Example',
        '[Amplitude] Page URL': 'https://www.example.com/about',
        '[Amplitude] Previous Page Location': 'https://www.example.com/home',
        '[Amplitude] Previous Page Type': 'internal',
      });
    });

    test('should assign direct to previous page type for unknown missing domains', async () => {
      await plugin.setup?.(mockConfig, mockAmplitude);

      const firstUrl = new URL('https://www.example.com/about?test=param');
      mockWindowLocationFromURL(firstUrl);
      window.history.pushState(undefined, firstUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event = await plugin.execute?.({
        event_type: 'test_event',
      });

      expect(event?.event_properties).toStrictEqual({
        '[Amplitude] Page Domain': 'www.example.com',
        '[Amplitude] Page Location': 'https://www.example.com/about?test=param',
        '[Amplitude] Page Path': '/about',
        '[Amplitude] Page Title': 'About - Example',
        '[Amplitude] Page URL': 'https://www.example.com/about',
        '[Amplitude] Previous Page Location': '',
        '[Amplitude] Previous Page Type': 'direct',
      });
    });

    test('should update current page if there is no current info', async () => {
      await plugin.setup?.(mockConfig, mockAmplitude);

      const firstUrl = new URL('https://www.example.com/about');
      mockWindowLocationFromURL(firstUrl);

      sessionStorage.clear();

      await plugin.execute?.({
        event_type: 'test_event',
      });

      const urlInfo = {
        [CURRENT_PAGE_STORAGE_KEY]: 'https://www.example.com/about',
        [PREVIOUS_PAGE_STORAGE_KEY]: '',
      };

      const urlInfoStr = sessionStorage?.getItem(URL_INFO_STORAGE_KEY) || '';
      expect(JSON.parse(urlInfoStr)).toStrictEqual(urlInfo);

      expect(sessionStorage?.getItem(URL_INFO_STORAGE_KEY)).toStrictEqual(
        JSON.stringify({
          [CURRENT_PAGE_STORAGE_KEY]: 'https://www.example.com/about',
          [PREVIOUS_PAGE_STORAGE_KEY]: '',
        }),
      );
    });
  });

  describe('teardown', () => {
    test('should call remove listeners', async () => {
      const removeEventListener = jest.spyOn(window, 'removeEventListener');
      await plugin.setup?.(mockConfig, mockAmplitude);
      await plugin.teardown?.();
      expect(removeEventListener).toHaveBeenCalledTimes(1);
    });

    test('sessionStorage items should be removed', async () => {
      await plugin.setup?.(mockConfig, mockAmplitude);
      const sessionStorage = getGlobalScope()?.sessionStorage;

      const initialURLInfo = {
        [CURRENT_PAGE_STORAGE_KEY]: 'www.example.com/home',
        [PREVIOUS_PAGE_STORAGE_KEY]: 'www.example.com/about',
      };

      sessionStorage?.setItem(URL_INFO_STORAGE_KEY, JSON.stringify(initialURLInfo));
      expect(sessionStorage?.getItem(URL_INFO_STORAGE_KEY)).toStrictEqual(JSON.stringify(initialURLInfo));

      await plugin.teardown?.();
      expect(sessionStorage?.getItem(URL_INFO_STORAGE_KEY)).toStrictEqual(JSON.stringify({}));
    });
  });

  describe('others', () => {
    // test('should handle when globalScope is not defined', async () => {});
    // test('should handle when sessionStorage is not defined', async () => {});
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
