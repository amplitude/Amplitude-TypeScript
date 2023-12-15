import { createInstance } from '@amplitude/analytics-browser';
import { Logger, UUID } from '@amplitude/analytics-core';
import { BrowserConfig, LogLevel } from '@amplitude/analytics-types';
import { pageViewTrackingPlugin, shouldTrackHistoryPageView } from '../src/page-view-tracking';
import { CookieStorage, FetchTransport } from '@amplitude/analytics-client-common';

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
      const amplitude = createInstance();
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
      const amplitude = createInstance();
      const track = jest.spyOn(amplitude, 'track');
      const plugin = pageViewTrackingPlugin(options);
      await plugin.setup?.(mockConfig, amplitude);
      expect(track).toHaveBeenCalledTimes(0);
    });

    test.each([
      { trackHistoryChanges: undefined },
      { trackHistoryChanges: 'pathOnly' as const },
      { trackHistoryChanges: 'all' as const },
    ])('should track dynamic page view', async (options) => {
      const amplitude = createInstance();
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
      { trackHistoryChanges: 'pathOnly' as const },
      {
        trackOn: () => {
          return !location.search.includes('about');
        },
      },
    ])('should not track dynamic page view', async (options) => {
      const amplitude = createInstance();
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
  });

  describe('execute', () => {
    test('should track a separate page view event on attribution', async () => {
      const plugin = pageViewTrackingPlugin({
        trackOn: 'attribution',
      });
      const amplitude = createInstance();
      const track = jest.spyOn(amplitude, 'track');
      await plugin.setup?.(mockConfig, amplitude);

      const event = await plugin.execute?.({
        event_type: 'session_start',
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
            initial_rtd_cid: 'EMPTY',
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
            rtd_cid: '-',
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
      expect(event?.event_type).toBe('session_start');
      expect(track).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenNthCalledWith(1, {
        event_type: '[Amplitude] Page Viewed',
        event_properties: {
          '[Amplitude] Page Domain': '',
          '[Amplitude] Page Location': '',
          '[Amplitude] Page Path': '',
          '[Amplitude] Page Title': '',
          '[Amplitude] Page URL': '',
        },
      });
    });

    test('should enrich page view track on attribution user props', async () => {
      const plugin = pageViewTrackingPlugin({
        trackOn: 'attribution',
      });
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
            initial_rtd_cid: 'EMPTY',
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
            rtd_cid: '-',
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
  });

  describe('teardown', () => {
    test('should call remove listeners', async () => {
      const amplitude = createInstance();
      const removeEventListener = jest.spyOn(window, 'removeEventListener');
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
  });

  test('shouldTrackHistoryPageView pathOnly option', () => {
    const url1 = 'https://www.example.com/path/to/page';
    const url2 = 'https://www.example.com/path/to/page?query=1';
    expect(shouldTrackHistoryPageView('all', url1, url2)).toBe(true);
    expect(shouldTrackHistoryPageView('pathOnly', url1, url1)).toBe(false);
  });
});

const mockWindowLocationFromURL = (url: URL) => {
  window.location.href = url.toString();
  window.location.search = url.search;
  window.location.hostname = url.hostname;
  window.location.pathname = url.pathname;
};
