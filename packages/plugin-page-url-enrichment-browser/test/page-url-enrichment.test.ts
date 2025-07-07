import { BrowserClient, BrowserConfig, LogLevel } from '@amplitude/analytics-types';
import {
  pageUrlEnrichmentPlugin,
  CURRENT_PAGE_STORAGE_KEY,
  PREVIOUS_PAGE_STORAGE_KEY,
  URL_INFO_STORAGE_KEY,
  isPageUrlEnrichmentEnabled,
} from '../src/page-url-enrichment';
import { Logger, UUID } from '@amplitude/analytics-core';
import { CookieStorage, FetchTransport } from '@amplitude/analytics-client-common';
import { getGlobalScope } from '@amplitude/analytics-core';
import * as Core from '@amplitude/analytics-core';

// Mock BrowserClient implementation
const createMockBrowserClient = (): jest.Mocked<BrowserClient> => {
  const mockClient = {
    init: jest.fn().mockReturnValue({
      promise: Promise.resolve(),
    }),
    add: jest.fn(),
    remove: jest.fn(),
    track: jest.fn(),
    logEvent: jest.fn(),
    identify: jest.fn(),
    groupIdentify: jest.fn(),
    setGroup: jest.fn(),
    revenue: jest.fn(),
    flush: jest.fn(),
    getUserId: jest.fn(),
    setUserId: jest.fn(),
    getDeviceId: jest.fn(),
    setDeviceId: jest.fn(),
    getSessionId: jest.fn(),
    setSessionId: jest.fn(),
    extendSession: jest.fn(),
    reset: jest.fn(),
    setOptOut: jest.fn(),
    setTransport: jest.fn(),
  } as unknown as jest.Mocked<BrowserClient>;

  // Set up default return values for methods that return promises
  mockClient.track.mockReturnValue({
    promise: Promise.resolve({
      code: 200,
      message: '',
      event: {
        event_type: '[Amplitude] Page Viewed',
      },
    }),
  });

  return mockClient;
};

const createConfigurationMock = (): jest.Mocked<BrowserConfig> => {
  return {
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
  } as unknown as jest.Mocked<BrowserConfig>;
};

describe('pageUrlEnrichmentPlugin', () => {
  let mockConfig: BrowserConfig = createConfigurationMock();
  let mockAmplitude = createMockBrowserClient();
  const plugin = pageUrlEnrichmentPlugin();

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
    mockAmplitude = createMockBrowserClient();
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
    jest.restoreAllMocks();
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
    test('should handle when globalScope is not defined', async () => {
      jest.spyOn(Core, 'getGlobalScope').mockReturnValue(undefined);
      const newPlugin = pageUrlEnrichmentPlugin();
      await newPlugin.setup?.(mockConfig, mockAmplitude);
      await newPlugin.teardown?.();
      expect(Core.getGlobalScope).toHaveBeenCalledTimes(1);
    });
    test('should handle when sessionStorage is not defined', async () => {
      const actual = jest.requireActual('@amplitude/analytics-core') as unknown as typeof Core;
      jest.spyOn(Core, 'getGlobalScope').mockReturnValue({
        ...actual.getGlobalScope(),
        sessionStorage: undefined,
      } as unknown as typeof globalThis);
      const newPlugin = pageUrlEnrichmentPlugin();
      await newPlugin.setup?.(mockConfig, mockAmplitude);

      const firstUrl = new URL('https://www.example.com/home');
      mockWindowLocationFromURL(firstUrl);
      mockDocumentTitle('Home - Example');
      window.history.pushState(undefined, firstUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      await newPlugin.execute?.({
        event_type: 'test_event',
      });
      await newPlugin.teardown?.();
      expect(Core.getGlobalScope).toHaveBeenCalledTimes(2);
    });
  });
});

describe('isPageUrlEnrichmentEnabled', () => {
  test('should return true with true parameter', () => {
    expect(isPageUrlEnrichmentEnabled(true)).toBe(true);
  });

  test('should return false with undefined parameter', () => {
    expect(isPageUrlEnrichmentEnabled(undefined)).toBe(false);
  });

  test('should return false with false parameter', () => {
    expect(isPageUrlEnrichmentEnabled(false)).toBe(false);
  });

  test('should return true with object parameter set to true', () => {
    expect(
      isPageUrlEnrichmentEnabled({
        pageUrlEnrichment: true,
      }),
    ).toBe(true);
  });

  test('should return false with object parameter set to false', () => {
    expect(
      isPageUrlEnrichmentEnabled({
        pageUrlEnrichment: false,
      }),
    ).toBe(false);
  });

  test('should return false with object parameter undefined', () => {
    expect(
      isPageUrlEnrichmentEnabled({
        pageUrlEnrichment: undefined,
      }),
    ).toBe(false);
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
