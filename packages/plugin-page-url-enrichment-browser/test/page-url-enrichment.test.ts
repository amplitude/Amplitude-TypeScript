import {
  type BrowserClient,
  type BrowserConfig,
  CookieStorage,
  FetchTransport,
  getGlobalScope,
  LogLevel,
  Logger,
  UUID,
} from '@amplitude/analytics-core';
import {
  CURRENT_PAGE_STORAGE_KEY,
  PREVIOUS_PAGE_STORAGE_KEY,
  URL_INFO_STORAGE_KEY,
  isPageUrlEnrichmentEnabled,
  pageUrlEnrichmentPlugin,
} from '../src/page-url-enrichment';
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
    window.sessionStorage.setItem('AMP_URL_INFO', '{}');
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

    test('should assign internal/external to previous page type for based on internal domain match', async () => {
      const plugin = pageUrlEnrichmentPlugin({ internalDomains: ['example.com', 'example.co.uk'] });
      await plugin.setup?.(mockConfig, mockAmplitude);

      // go from example.com to subdomain.test.example.com (internal)
      const firstUrl = new URL('https://www.example.com/home');
      mockWindowLocationFromURL(firstUrl);
      window.history.pushState(undefined, firstUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const secondUrl = new URL('https://www.subdomain.test.example.com/about?test=param');
      mockWindowLocationFromURL(secondUrl);
      mockDocumentTitle('About - Example');
      window.history.pushState(undefined, secondUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event = await plugin.execute?.({
        event_type: 'test_event',
      });

      expect(event?.event_properties).toStrictEqual({
        '[Amplitude] Page Domain': 'www.subdomain.test.example.com',
        '[Amplitude] Page Location': 'https://www.subdomain.test.example.com/about?test=param',
        '[Amplitude] Page Path': '/about',
        '[Amplitude] Page Title': 'About - Example',
        '[Amplitude] Page URL': 'https://www.subdomain.test.example.com/about',
        '[Amplitude] Previous Page Location': 'https://www.example.com/home',
        '[Amplitude] Previous Page Type': 'internal',
      });

      // go from subdomain.test.example.com to example.co.uk (internal)
      const thirdUrl = new URL('https://www.example.co.uk/contact');
      mockWindowLocationFromURL(thirdUrl);
      mockDocumentTitle('Contact - Example');
      window.history.pushState(undefined, thirdUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event2 = await plugin.execute?.({
        event_type: 'test_event_2',
      });

      expect(event2?.event_properties).toStrictEqual({
        '[Amplitude] Page Domain': 'www.example.co.uk',
        '[Amplitude] Page Location': 'https://www.example.co.uk/contact',
        '[Amplitude] Page Path': '/contact',
        '[Amplitude] Page Title': 'Contact - Example',
        '[Amplitude] Page URL': 'https://www.example.co.uk/contact',
        '[Amplitude] Previous Page Location': 'https://www.subdomain.test.example.com/about?test=param',
        '[Amplitude] Previous Page Type': 'internal',
      });

      // go from example.co.uk to example.org (external)
      const fourthUrl = new URL('https://www.example.org/home');
      mockWindowLocationFromURL(fourthUrl);
      mockDocumentTitle('Home - Example');
      window.history.pushState(undefined, fourthUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event3 = await plugin.execute?.({
        event_type: 'test_event_3',
      });

      expect(event3?.event_properties).toStrictEqual({
        '[Amplitude] Page Domain': 'www.example.org',
        '[Amplitude] Page Location': 'https://www.example.org/home',
        '[Amplitude] Page Path': '/home',
        '[Amplitude] Page Title': 'Home - Example',
        '[Amplitude] Page URL': 'https://www.example.org/home',
        '[Amplitude] Previous Page Location': 'https://www.example.co.uk/contact',
        '[Amplitude] Previous Page Type': 'external',
      });

      // go from example.org to example.com (external)
      const fifthUrl = new URL('https://www.example.com/about');
      mockWindowLocationFromURL(fifthUrl);
      mockDocumentTitle('About - Example');
      window.history.pushState(undefined, fifthUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event4 = await plugin.execute?.({
        event_type: 'test_event_4',
      });

      expect(event4?.event_properties).toStrictEqual({
        '[Amplitude] Page Domain': 'www.example.com',
        '[Amplitude] Page Location': 'https://www.example.com/about',
        '[Amplitude] Page Path': '/about',
        '[Amplitude] Page Title': 'About - Example',
        '[Amplitude] Page URL': 'https://www.example.com/about',
        '[Amplitude] Previous Page Location': 'https://www.example.org/home',
        '[Amplitude] Previous Page Type': 'external',
      });
    });

    test('should assign direct to previous page type for unknown missing domains', async () => {
      await plugin.setup?.(mockConfig, mockAmplitude);

      const firstUrl = new URL('https://www.example.com/about?test=param');
      mockWindowLocationFromURL(firstUrl);
      mockDocumentTitle('About - Example');
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

    test('should not add properties if they already exist', async () => {
      await plugin.setup?.(mockConfig, mockAmplitude);

      const firstUrl = new URL('https://www.example.com/home');
      mockWindowLocationFromURL(firstUrl);
      window.history.pushState(undefined, firstUrl.href);
      // block event loop so that the sessionStorage is updated since pushState is async
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event = await plugin.execute?.({
        event_type: 'test_event',
        event_properties: {
          '[Amplitude] Page Domain': 'www.existingexample.com',
          '[Amplitude] Page Location': 'https://www.existingexample.com/about?test=param',
          '[Amplitude] Page Path': '/existingexample',
          '[Amplitude] Page Title': 'Existing Example',
          '[Amplitude] Page URL': 'https://www.existingexample.com/about',
        },
      });

      expect(event?.event_properties).toStrictEqual({
        '[Amplitude] Page Domain': 'www.existingexample.com',
        '[Amplitude] Page Location': 'https://www.existingexample.com/about?test=param',
        '[Amplitude] Page Path': '/existingexample',
        '[Amplitude] Page Title': 'Existing Example',
        '[Amplitude] Page URL': 'https://www.existingexample.com/about',
        '[Amplitude] Previous Page Location': '',
        '[Amplitude] Previous Page Type': 'direct',
      });
    });

    test('should ignore event if it is one of the default event types to be excluded', async () => {
      await plugin.setup?.(mockConfig, mockAmplitude);

      const excludedEvent = await plugin.execute?.({
        event_type: '$identify',
      });

      expect(excludedEvent?.event_properties).toStrictEqual(undefined);
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

  describe('first page load with document.referrer', () => {
    test('should set Previous Page Type to "direct" when no referrer exists', async () => {
      sessionStorage.clear();

      Object.defineProperty(document, 'referrer', {
        value: '',
        configurable: true,
      });

      const newPlugin = pageUrlEnrichmentPlugin();
      await newPlugin.setup?.(mockConfig, mockAmplitude);

      const firstUrl = new URL('https://www.example.com/');
      mockWindowLocationFromURL(firstUrl);
      mockDocumentTitle('Home - Example');

      window.history.replaceState(undefined, '');
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event = await newPlugin.execute?.({
        event_type: 'Page View',
      });

      expect(event?.event_properties).toMatchObject({
        '[Amplitude] Page Domain': 'www.example.com',
        '[Amplitude] Page Location': 'https://www.example.com/',
        '[Amplitude] Previous Page Location': '',
        '[Amplitude] Previous Page Type': 'direct',
      });

      const urlInfoStr = sessionStorage?.getItem(URL_INFO_STORAGE_KEY) || '';
      const urlInfo = JSON.parse(urlInfoStr);
      expect(urlInfo[CURRENT_PAGE_STORAGE_KEY]).toBe('https://www.example.com/');
      expect(urlInfo[PREVIOUS_PAGE_STORAGE_KEY]).toBe('');

      await newPlugin.teardown?.();
    });

    test('should preserve external referrer on first page load', async () => {
      sessionStorage.clear();

      Object.defineProperty(document, 'referrer', {
        value: 'https://google.com/search',
        configurable: true,
      });

      const newPlugin = pageUrlEnrichmentPlugin();
      await newPlugin.setup?.(mockConfig, mockAmplitude);

      const firstUrl = new URL('https://www.example.com/');
      mockWindowLocationFromURL(firstUrl);
      mockDocumentTitle('Home - Example');

      window.history.replaceState(undefined, '');
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event = await newPlugin.execute?.({
        event_type: 'Page View',
      });

      expect(event?.event_properties).toMatchObject({
        '[Amplitude] Page Domain': 'www.example.com',
        '[Amplitude] Page Location': 'https://www.example.com/',
        '[Amplitude] Previous Page Location': 'https://google.com/search',
        '[Amplitude] Previous Page Type': 'external',
      });

      const urlInfoStr = sessionStorage?.getItem(URL_INFO_STORAGE_KEY) || '';
      const urlInfo = JSON.parse(urlInfoStr);
      expect(urlInfo[CURRENT_PAGE_STORAGE_KEY]).toBe('https://www.example.com/');
      expect(urlInfo[PREVIOUS_PAGE_STORAGE_KEY]).toBe('https://google.com/search');

      await newPlugin.teardown?.();
    });

    test('should handle history events before first event is tracked', async () => {
      sessionStorage.clear();

      Object.defineProperty(document, 'referrer', {
        value: '',
        configurable: true,
      });

      const newPlugin = pageUrlEnrichmentPlugin();
      await newPlugin.setup?.(mockConfig, mockAmplitude);

      const firstUrl = new URL('https://www.example.com/home');
      mockWindowLocationFromURL(firstUrl);

      window.history.pushState(undefined, '');
      await new Promise((resolve) => setTimeout(resolve, 0));

      window.history.replaceState(undefined, '');
      await new Promise((resolve) => setTimeout(resolve, 0));

      const event = await newPlugin.execute?.({
        event_type: 'Page View',
      });

      expect(event?.event_properties).toMatchObject({
        '[Amplitude] Previous Page Location': '',
        '[Amplitude] Previous Page Type': 'direct',
      });

      await newPlugin.teardown?.();
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
