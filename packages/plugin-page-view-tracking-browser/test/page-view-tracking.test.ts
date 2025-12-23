import { Logger, UUID, BrowserClient, BrowserConfig, LogLevel } from '@amplitude/analytics-core';
import { defaultPageViewEvent, pageViewTrackingPlugin, shouldTrackHistoryPageView } from '../src/page-view-tracking';
import { CookieStorage, FetchTransport } from '@amplitude/analytics-client-common';

// Mock BrowserClient implementation
const createMockBrowserClient = (): jest.Mocked<BrowserClient> => {
  const mockClient = {
    init: jest.fn(),
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
    getOptOut: jest.fn(),
    getIdentity: jest.fn(),
    _setDiagnosticsSampleRate: jest.fn(),
  } as jest.Mocked<BrowserClient>;

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

describe('pageViewTrackingPlugin', () => {
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

  describe('setup', () => {
    test.each([
      { trackHistoryChanges: undefined },
      { trackHistoryChanges: 'pathOnly' as const },
      { trackHistoryChanges: 'all' as const },
    ])('should track dynamic page view', async (options) => {
      mockConfig.pageCounter = 0;

      const amplitude = createMockBrowserClient();
      const track = jest.spyOn(amplitude, 'track').mockReturnValue({
        promise: Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: '[Amplitude] Page Viewed',
          },
        }),
      });

      const oldURL = new URL('https://www.example.com/home');
      mockWindowLocationFromURL(oldURL);
      const plugin = pageViewTrackingPlugin(options);
      await plugin.setup?.(mockConfig, amplitude);

      const newURL = new URL('https://www.example.com/about');
      mockWindowLocationFromURL(newURL);
      window.history.pushState(undefined, newURL.href);

      // Page view tracking on push state executes async
      // Block event loop for 1s before asserting
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(track).toHaveBeenNthCalledWith(2, {
        event_properties: {
          '[Amplitude] Page Domain': newURL.hostname,
          '[Amplitude] Page Location': newURL.toString(),
          '[Amplitude] Page Path': newURL.pathname,
          '[Amplitude] Page Title': '',
          '[Amplitude] Page URL': newURL.toString(),
        },
        event_type: '[Amplitude] Page Viewed',
      });
      expect(track).toHaveBeenCalledTimes(2);
    });

    test.each([
      undefined,
      {},
      {
        trackOn: undefined,
      },
      {
        trackOn: () => true,
        eventType: 'Page Viewed',
      },
    ])('should track initial page view', async (options) => {
      mockConfig.pageCounter = 0;
      const amplitude = createMockBrowserClient();
      const search = 'utm_source=google&utm_medium=cpc&utm_campaign=brand&utm_term=keyword&utm_content=adcopy';
      const hostname = 'www.example.com';
      const pathname = '/path/to/page';
      const url = new URL(`https://${hostname}${pathname}?${search}`);
      mockWindowLocationFromURL(url);
      const track = jest.spyOn(amplitude, 'track').mockReturnValueOnce({
        promise: Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: '[Amplitude] Page Viewed',
          },
        }),
      });
      const plugin = pageViewTrackingPlugin(options);
      await plugin.setup?.(mockConfig, amplitude);
      expect(track).toHaveBeenCalledWith({
        event_properties: {
          '[Amplitude] Page Domain': hostname,
          '[Amplitude] Page Location': url.toString(),
          '[Amplitude] Page Path': pathname,
          '[Amplitude] Page Title': '',
          '[Amplitude] Page URL': `https://${hostname}${pathname}`,
          utm_source: 'google',
          utm_medium: 'cpc',
          utm_campaign: 'brand',
          utm_term: 'keyword',
          utm_content: 'adcopy',
        },
        event_type: options?.eventType ?? '[Amplitude] Page Viewed',
      });
      expect(track).toHaveBeenCalledTimes(1);
    });

    test.each([
      {
        trackOn: 'attribution' as const,
      },
      {
        trackOn: () => false,
      },
    ])('should not track initial page view', async (options) => {
      const amplitude = createMockBrowserClient();
      const track = jest.spyOn(amplitude, 'track');
      const plugin = pageViewTrackingPlugin(options);
      await plugin.setup?.(mockConfig, amplitude);
      expect(track).toHaveBeenCalledTimes(0);
    });

    test.each([
      { trackHistoryChanges: 'pathOnly' as const },
      {
        trackOn: () => {
          return !location.search.includes('about');
        },
      },
    ])('should not track dynamic page view', async (options) => {
      const amplitude = createMockBrowserClient();
      const track = jest.spyOn(amplitude, 'track').mockReturnValue({
        promise: Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: '[Amplitude] Page Viewed',
          },
        }),
      });

      const oldURL = new URL('https://www.example.com?page=home');
      mockWindowLocationFromURL(oldURL);

      const plugin = pageViewTrackingPlugin(options);
      await plugin.setup?.(mockConfig, amplitude);

      const newURL = new URL('https://www.example.com?page=about');
      mockWindowLocationFromURL(newURL);
      window.history.pushState(undefined, newURL.href);

      // Page view tracking on push state executes async
      // Block event loop for 1s before asserting
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(track).toHaveBeenCalledTimes(1);
    });

    test('should track dynamic page view with decoded URI location info', async () => {
      mockConfig.pageCounter = 0;

      const amplitude = createMockBrowserClient();
      const track = jest.spyOn(amplitude, 'track').mockReturnValue({
        promise: Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: '[Amplitude] Page Viewed',
          },
        }),
      });

      const oldURL = new URL('https://www.example.com');
      mockWindowLocationFromURL(oldURL);
      const plugin = pageViewTrackingPlugin();
      await plugin.setup?.(mockConfig, amplitude);

      // https://www.example.com/home-шеллы?x=test
      const newURL = new URL('https://www.example.com/home-%D1%88%D0%B5%D0%BB%D0%BB%D1%8B?x=test');
      mockWindowLocationFromURL(newURL);
      window.history.pushState(undefined, newURL.href);

      // Page view tracking on push state executes async
      // Block event loop for 1s before asserting
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(track).toHaveBeenNthCalledWith(1, {
        event_properties: {
          '[Amplitude] Page Domain': oldURL.hostname,
          '[Amplitude] Page Location': oldURL.toString(),
          '[Amplitude] Page Path': oldURL.pathname,
          '[Amplitude] Page Title': '',
          '[Amplitude] Page URL': oldURL.toString(),
        },
        event_type: '[Amplitude] Page Viewed',
      });

      expect(track).toHaveBeenNthCalledWith(2, {
        event_properties: {
          '[Amplitude] Page Domain': newURL.hostname,
          '[Amplitude] Page Location': 'https://www.example.com/home-шеллы?x=test',
          '[Amplitude] Page Path': '/home-шеллы',
          '[Amplitude] Page Title': '',
          '[Amplitude] Page URL': 'https://www.example.com/home-шеллы',
        },
        event_type: '[Amplitude] Page Viewed',
      });

      expect(track).toHaveBeenCalledTimes(2);
    });

    test('should track dynamic page view with malformed location info', async () => {
      mockConfig.pageCounter = 0;

      const amplitude = createMockBrowserClient();
      const track = jest.spyOn(amplitude, 'track').mockReturnValue({
        promise: Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: '[Amplitude] Page Viewed',
          },
        }),
      });

      const oldURL = new URL('https://www.example.com');
      mockWindowLocationFromURL(oldURL);
      const plugin = pageViewTrackingPlugin();
      await plugin.setup?.(mockConfig, amplitude);

      const malformedPath = '/home-%D1%88%D0%B5%D0BB%D0%BB%D1%8B'; // Invalid encoding string
      const malformedURL = `https://www.example.com${malformedPath}`;
      const malformedLocation = `https://www.example.com${malformedPath}?x=test`;
      const newURL = new URL(malformedLocation);
      mockWindowLocationFromURL(newURL);
      window.history.pushState(undefined, newURL.href);

      // Page view tracking on push state executes async
      // Block event loop for 1s before asserting
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(track).toHaveBeenNthCalledWith(1, {
        event_properties: {
          '[Amplitude] Page Domain': oldURL.hostname,
          '[Amplitude] Page Location': oldURL.toString(),
          '[Amplitude] Page Path': oldURL.pathname,
          '[Amplitude] Page Title': '',
          '[Amplitude] Page URL': oldURL.toString(),
        },
        event_type: '[Amplitude] Page Viewed',
      });

      expect(track).toHaveBeenNthCalledWith(2, {
        event_properties: {
          '[Amplitude] Page Domain': newURL.hostname,
          '[Amplitude] Page Location': malformedLocation,
          '[Amplitude] Page Path': malformedPath,
          '[Amplitude] Page Title': '',
          '[Amplitude] Page URL': malformedURL,
        },
        event_type: '[Amplitude] Page Viewed',
      });

      expect(track).toHaveBeenCalledTimes(2);
    });

    test('should track dynamic page view with regular location info', async () => {
      mockConfig.pageCounter = 0;

      const amplitude = createMockBrowserClient();
      const track = jest.spyOn(amplitude, 'track').mockReturnValue({
        promise: Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: '[Amplitude] Page Viewed',
          },
        }),
      });

      const oldURL = new URL('https://www.example.com');
      mockWindowLocationFromURL(oldURL);
      const plugin = pageViewTrackingPlugin();
      await plugin.setup?.(mockConfig, amplitude);

      const newBaseURL = `https://www.example.com/home-shell`;
      const newURL = new URL(`${newBaseURL}?x=test`);
      mockWindowLocationFromURL(newURL);
      window.history.pushState(undefined, newURL.href);

      // Page view tracking on push state executes async
      // Block event loop for 1s before asserting
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(track).toHaveBeenNthCalledWith(1, {
        event_properties: {
          '[Amplitude] Page Domain': oldURL.hostname,
          '[Amplitude] Page Location': oldURL.toString(),
          '[Amplitude] Page Path': oldURL.pathname,
          '[Amplitude] Page Title': '',
          '[Amplitude] Page URL': oldURL.toString(),
        },
        event_type: '[Amplitude] Page Viewed',
      });

      expect(track).toHaveBeenNthCalledWith(2, {
        event_properties: {
          '[Amplitude] Page Domain': newURL.hostname,
          '[Amplitude] Page Location': newURL.toString(),
          '[Amplitude] Page Path': newURL.pathname,
          '[Amplitude] Page Title': '',
          '[Amplitude] Page URL': newBaseURL,
        },
        event_type: '[Amplitude] Page Viewed',
      });

      expect(track).toHaveBeenCalledTimes(2);
    });
  });

  describe('execute', () => {
    test('should track page view on attribution', async () => {
      const amplitude = createMockBrowserClient();
      const plugin = pageViewTrackingPlugin({
        trackOn: 'attribution',
      });
      await plugin.setup?.(mockConfig, amplitude);
      const event = await plugin.execute?.({
        event_type: '$identify',
        user_properties: {
          $set: {
            utm_source: 'amp-test',
          },
          $setOnce: {
            initial_dclid: 'EMPTY',
            initial_fbclid: 'EMPTY',
            initial_gbraid: 'EMPTY',
            initial_gclid: 'EMPTY',
            initial_ko_click_id: 'EMPTY',
            initial_li_fat_id: 'EMPTY',
            initial_msclkid: 'EMPTY',
            initial_wbraid: 'EMPTY',
            initial_referrer: 'EMPTY',
            initial_referring_domain: 'EMPTY',
            initial_rdt_cid: 'EMPTY',
            initial_ttclid: 'EMPTY',
            initial_twclid: 'EMPTY',
            initial_utm_campaign: 'EMPTY',
            initial_utm_content: 'EMPTY',
            initial_utm_id: 'EMPTY',
            initial_utm_medium: 'EMPTY',
            initial_utm_source: 'amp-test',
            initial_utm_term: 'EMPTY',
          },
          $unset: {
            dclid: '-',
            fbclid: '-',
            gbraid: '-',
            gclid: '-',
            ko_click_id: '-',
            li_fat_id: '-',
            msclkid: '-',
            wbraid: '-',
            referrer: '-',
            referring_domain: '-',
            rdt_cid: '-',
            ttclid: '-',
            twclid: '-',
            utm_campaign: '-',
            utm_content: '-',
            utm_id: '-',
            utm_medium: '-',
            utm_term: '-',
          },
        },
      });
      expect(event?.event_type).toBe('[Amplitude] Page Viewed');
    });

    test('should return same event if it is not attribution event', async () => {
      const plugin = pageViewTrackingPlugin({
        trackOn: 'attribution',
      });
      const sentEvent = {
        event_type: '$identify',
        user_properties: {},
      };
      const event = await plugin.execute?.(sentEvent);
      expect(event).toBe(sentEvent);
    });

    test('should return same event if it does not have user_properties', async () => {
      const plugin = pageViewTrackingPlugin({
        trackOn: 'attribution',
      });

      const sentEvent = {
        event_type: '$identify',
      };
      const event = await plugin.execute?.(sentEvent);
      expect(event).toBe(sentEvent);
    });

    test('should return same event if it is not identify event', async () => {
      const plugin = pageViewTrackingPlugin({
        trackOn: 'attribution',
      });

      const sentEvent = {
        event_type: '[Amplitude] Page Viewed',
      };
      const event = await plugin.execute?.(sentEvent);
      expect(event).toBe(sentEvent);
    });

    test('should set the pageCounter', async () => {
      const config = { ...mockConfig };
      config.pageCounter = 0;
      const amplitude = createMockBrowserClient();
      jest.spyOn(amplitude, 'track').mockReturnValue({
        promise: Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: defaultPageViewEvent,
          },
        }),
      });

      const plugin = pageViewTrackingPlugin();
      await plugin.setup?.(config, amplitude);
      await plugin.execute?.({ event_type: defaultPageViewEvent });
      expect(config.pageCounter).toBe(1);

      await plugin.execute?.({ event_type: defaultPageViewEvent });
      expect(config.pageCounter).toBe(2);
    });

    test('should not set the pageCounter', async () => {
      const config = { ...mockConfig };
      config.pageCounter = 0;
      const amplitude = createMockBrowserClient();
      jest.spyOn(amplitude, 'track').mockReturnValue({
        promise: Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: defaultPageViewEvent,
          },
        }),
      });

      const plugin = pageViewTrackingPlugin();
      await plugin.setup?.(config, amplitude);
      await plugin.execute?.({ event_type: 'other event' });
      expect(config.pageCounter).toBe(0);
    });
  });

  describe('teardown', () => {
    test('should call remove listeners', async () => {
      const amplitude = createMockBrowserClient();
      const removeEventListener = jest.spyOn(window, 'removeEventListener');
      jest.spyOn(amplitude, 'track').mockReturnValueOnce({
        promise: Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: 'event_type',
          },
        }),
      });
      const plugin = pageViewTrackingPlugin();
      await plugin.setup?.(mockConfig, amplitude);
      await plugin.teardown?.();
      expect(removeEventListener).toHaveBeenCalledTimes(1);
    });

    test('should call remove listeners without proxy', async () => {
      const removeEventListener = jest.spyOn(window, 'removeEventListener');
      const plugin = pageViewTrackingPlugin();
      await plugin.teardown?.();
      expect(removeEventListener).toHaveBeenCalledTimes(1);
    });

    test('should not restore history.pushState after teardown', async () => {
      /* eslint-disable @typescript-eslint/unbound-method */
      const history = window.history;
      const originalPushState = history.pushState;
      const plugin = pageViewTrackingPlugin({
        trackHistoryChanges: 'all',
      });
      expect(history.pushState).toBe(originalPushState);
      await plugin.setup?.(mockConfig, createMockBrowserClient());
      expect(history.pushState).not.toBe(originalPushState);
      await plugin.teardown?.();
      expect(history.pushState).not.toBe(originalPushState);
      /* eslint-enable @typescript-eslint/unbound-method */
    });
  });

  test('shouldTrackHistoryPageView pathOnly option', () => {
    const url1 = 'https://www.example.com/path/to/page';
    const url2 = 'https://www.example.com/path/to/page?query=1';
    expect(shouldTrackHistoryPageView('all', url1, url2)).toBe(true);
    expect(shouldTrackHistoryPageView('pathOnly', url1, url2)).toBe(false);
  });

  test('shouldTrackHistoryPageView pathOnly option with hash route', () => {
    const url1 = 'https://www.example.com/path/to/page';
    const url2 = 'https://www.example.com/path/to/page#home';
    expect(shouldTrackHistoryPageView('all', url1, url2)).toBe(true);
    expect(shouldTrackHistoryPageView('pathOnly', url1, url2)).toBe(false);
  });

  test('shouldTrackHistoryPageView pathOnly option with null previous url', () => {
    const url1 = 'https://www.example.com/path/to/page';
    const url2 = '';
    expect(shouldTrackHistoryPageView('all', url1, url2)).toBe(true);
    expect(shouldTrackHistoryPageView('pathOnly', url1, url2)).toBe(true);
  });
});

const mockWindowLocationFromURL = (url: URL) => {
  window.location.href = url.toString();
  window.location.search = url.search;
  window.location.hostname = url.hostname;
  window.location.pathname = url.pathname;
};
