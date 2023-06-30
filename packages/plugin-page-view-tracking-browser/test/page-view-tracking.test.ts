import { createInstance } from '@amplitude/analytics-browser';
import { MemoryStorage, UUID } from '@amplitude/analytics-core';
import { BrowserConfig, Config, Logger } from '@amplitude/analytics-types';
import { pageViewTrackingPlugin, shouldTrackHistoryPageView } from '../src/page-view-tracking';

describe('pageViewTrackingPlugin', () => {
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

  const API_KEY = 'API_KEY';
  const USER_ID = 'USER_ID';

  describe('setup', () => {
    let instance = createInstance();

    beforeEach(async () => {
      instance = createInstance();
      await instance.init(API_KEY, USER_ID, {
        attribution: {
          disabled: true,
        },
      }).promise;
    });

    test('should handle expected BrowserClient, but got Options', async () => {
      const track = jest.spyOn(instance, 'track');
      const loggerProvider: Partial<Logger> = {
        error: jest.fn(),
      };
      const config: Partial<Config> = {
        loggerProvider: loggerProvider as Logger,
      };

      const plugin = pageViewTrackingPlugin({});
      await plugin.setup(config as Config);

      expect(track).toHaveBeenCalledTimes(0);
      expect(loggerProvider.error).toHaveBeenCalledTimes(1);
      expect(loggerProvider.error).toHaveBeenCalledWith(
        `Argument of type 'Options' is not assignable to parameter of type 'BrowserClient'.`,
      );
    });

    test('should handle expected BrowserClient, but got undefined', async () => {
      const track = jest.spyOn(instance, 'track');
      const loggerProvider: Partial<Logger> = {
        error: jest.fn(),
      };
      const config: Partial<Config> = {
        loggerProvider: loggerProvider as Logger,
      };

      const plugin = pageViewTrackingPlugin();
      await plugin.setup(config as Config);

      expect(track).toHaveBeenCalledTimes(0);
      expect(loggerProvider.error).toHaveBeenCalledTimes(1);
      expect(loggerProvider.error).toHaveBeenCalledWith(
        `Argument of type 'undefined' is not assignable to parameter of type 'BrowserClient'.`,
      );
    });

    test('should handle overlapping behavior from core and plugin', async () => {
      const track = jest.spyOn(instance, 'track');
      const loggerProvider: Partial<Logger> = {
        warn: jest.fn(),
        log: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        apiKey: UUID(),
        loggerProvider: loggerProvider as Logger,
        cookieStorage: new MemoryStorage(),
        attribution: {
          trackPageViews: true,
        },
      };

      const plugin = pageViewTrackingPlugin(instance);
      await plugin.setup(config as Config);

      expect(track).toHaveBeenCalledTimes(0);
      expect(loggerProvider.log).toHaveBeenCalledTimes(1);
      expect(loggerProvider.log).toHaveBeenCalledWith(`Installing @amplitude/plugin-page-view-tracking-browser`);
      expect(loggerProvider.warn).toHaveBeenCalledTimes(1);
      expect(loggerProvider.warn).toHaveBeenCalledWith(
        `@amplitude/plugin-page-view-tracking-browser overrides page view tracking behavior defined in @amplitude/analytics-browser. Resolve by disabling page view tracking in @amplitude/analytics-browser.`,
      );
    });

    test('should handle non-overlapping behavior from core and plugin', async () => {
      const track = jest.spyOn(instance, 'track');
      const loggerProvider: Partial<Logger> = {
        warn: jest.fn(),
        log: jest.fn(),
      };
      const config: Partial<BrowserConfig> = {
        apiKey: UUID(),
        loggerProvider: loggerProvider as Logger,
        cookieStorage: new MemoryStorage(),
      };

      const plugin = pageViewTrackingPlugin(instance);
      await plugin.setup(config as Config);

      expect(track).toHaveBeenCalledTimes(1);
      expect(loggerProvider.log).toHaveBeenCalledTimes(2);
      expect(loggerProvider.log).toHaveBeenCalledWith(`Installing @amplitude/plugin-page-view-tracking-browser`);
      expect(loggerProvider.warn).toHaveBeenCalledTimes(0);
    });

    describe('should send a page view event', () => {
      test('when attribution event is sent and trackOn is "attribution"', async () => {
        const instance = createInstance();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce({
          promise: Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        });

        const plugin = pageViewTrackingPlugin(instance, {
          trackOn: 'attribution',
        });
        await instance.add(plugin).promise;

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        }).promise;

        const event = await plugin.execute({
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
        expect(event?.event_type).toBe('Page View');
        expect(track).toHaveBeenCalledTimes(0);
      });

      test('when attribution event is sent, trackPageViews is undefined and attribution.trackPageViews is true', async () => {
        const instance = createInstance();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce({
          promise: Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        });

        const plugin = pageViewTrackingPlugin(instance);
        await instance.add(plugin).promise;

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
            trackPageViews: true,
          },
        }).promise;

        const event = await plugin.execute({
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
        expect(event?.event_type).toBe('Page View');
        expect(track).toHaveBeenCalledTimes(0);
      });

      test('when trackOn is a function and it returns true', async () => {
        const instance = createInstance();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce({
          promise: Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        });

        await instance.add(
          pageViewTrackingPlugin(instance, {
            trackOn: () => true,
            eventType: '[Amplitude] Page Viewed',
          }),
        ).promise;

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        }).promise;

        expect(track).toHaveBeenCalledWith({
          event_properties: {
            page_domain: '',
            page_location: '',
            page_path: '',
            page_title: '',
            page_url: '',
          },
          event_type: '[Amplitude] Page Viewed',
        });
        expect(track).toHaveBeenCalledTimes(1);
      });

      test('when trackOn is undefined', async () => {
        const instance = createInstance();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce({
          promise: Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        });

        await instance.add(pageViewTrackingPlugin(instance)).promise;

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        }).promise;

        expect(track).toHaveBeenCalledWith({
          event_properties: {
            page_domain: '',
            page_location: '',
            page_path: '',
            page_title: '',
            page_url: '',
          },
          event_type: 'Page View',
        });
        expect(track).toHaveBeenCalledTimes(1);
      });
    });

    describe('should not send a page view event', () => {
      test('when attribution event is not sent and trackOn is "attribution"', async () => {
        const instance = createInstance();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce({
          promise: Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        });

        await instance.add(
          pageViewTrackingPlugin(instance, {
            trackOn: 'attribution',
          }),
        ).promise;

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        }).promise;

        expect(track).toHaveBeenCalledTimes(0);
      });

      test('when trackOn is a function and it returns false', async () => {
        const instance = createInstance();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce({
          promise: Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        });

        await instance.add(
          pageViewTrackingPlugin(instance, {
            trackOn: () => false,
          }),
        ).promise;

        await instance.init(API_KEY, USER_ID).promise;

        expect(track).toHaveBeenCalledTimes(0);
      });
    });
  });

  describe('execute', () => {
    test('should return same event if it is not attribution event', async () => {
      const instance = createInstance();
      const plugin = pageViewTrackingPlugin(instance, {
        trackOn: 'attribution',
      });

      const sentEvent = {
        event_type: '$identify',
        user_properties: {},
      };
      const event = await plugin.execute(sentEvent);
      expect(event).toBe(sentEvent);
    });

    test('should return same event if it does not have user_properties', async () => {
      const instance = createInstance();
      const plugin = pageViewTrackingPlugin(instance, {
        trackOn: 'attribution',
      });

      const sentEvent = {
        event_type: '$identify',
      };
      const event = await plugin.execute(sentEvent);
      expect(event).toBe(sentEvent);
    });

    test('should return same event if it is not identify event', async () => {
      const instance = createInstance();
      const plugin = pageViewTrackingPlugin(instance, {
        trackOn: 'attribution',
      });

      const sentEvent = {
        event_type: 'track event',
      };
      const event = await plugin.execute(sentEvent);
      expect(event).toBe(sentEvent);
    });

    test('should send utm parameters from URL in page view event', async () => {
      const instance = createInstance();
      const search = 'utm_source=google&utm_medium=cpc&utm_campaign=brand&utm_term=keyword&utm_content=adcopy';
      const hostname = 'www.example.com';
      const pathname = '/path/to/page';
      const url = new URL(`https://${hostname}${pathname}?${search}`);
      mockWindowLocationFromURL(url);
      const track = jest.spyOn(instance, 'track').mockReturnValueOnce({
        promise: Promise.resolve({
          code: 200,
          message: '',
          event: {
            event_type: 'event_type',
          },
        }),
      });

      await instance.add(pageViewTrackingPlugin(instance)).promise;

      await instance.init(API_KEY, USER_ID, {
        attribution: {
          disabled: true,
        },
      }).promise;

      expect(track).toHaveBeenCalledWith({
        event_properties: {
          page_domain: hostname,
          page_location: url.toString(),
          page_path: pathname,
          page_title: '',
          page_url: `https://${hostname}${pathname}`,
          utm_source: 'google',
          utm_medium: 'cpc',
          utm_campaign: 'brand',
          utm_term: 'keyword',
          utm_content: 'adcopy',
        },
        event_type: 'Page View',
      });
      expect(track).toHaveBeenCalledTimes(1);
    });
  });

  describe('teardown', () => {
    test('should call remove listeners', async () => {
      const amplitude = createInstance();
      const removeEventListener = jest.spyOn(window, 'removeEventListener');
      const loggerProvider: Partial<Logger> = {
        log: jest.fn(),
      };
      const config: Partial<Config> = {
        loggerProvider: loggerProvider as Logger,
      };
      const plugin = pageViewTrackingPlugin({
        trackHistoryChanges: 'all',
      });
      await plugin.setup(config as Config, amplitude);
      await plugin.teardown?.();
      expect(removeEventListener).toHaveBeenCalledTimes(1);
    });

    test('should call remove listeners without proxy', async () => {
      const removeEventListener = jest.spyOn(window, 'removeEventListener');
      const plugin = pageViewTrackingPlugin({
        trackHistoryChanges: 'all',
      });
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

  test('track SPA page view on history push', async () => {
    const instance = createInstance();
    const track = jest.spyOn(instance, 'track').mockReturnValue({
      promise: Promise.resolve({
        code: 200,
        message: '',
        event: {
          event_type: 'event_type',
        },
      }),
    });

    const plugin = pageViewTrackingPlugin(instance, {
      trackHistoryChanges: 'all',
      trackOn: () => window.location.hostname !== 'www.google.com',
    });
    await instance.add(plugin).promise;

    await instance.init(API_KEY, USER_ID, {
      attribution: {
        disabled: true,
      },
    }).promise;

    expect(track).toHaveBeenCalledWith({
      event_properties: {
        page_domain: '',
        page_location: '',
        page_path: '',
        page_title: '',
        page_url: '',
      },
      event_type: 'Page View',
    });
    expect(track).toHaveBeenCalledTimes(1);

    const mockURL = new URL('https://www.example.com/path/to/page');
    mockWindowLocationFromURL(mockURL);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await (plugin as any).__trackHistoryPageView();

    expect(track).toHaveBeenCalledWith({
      event_properties: {
        page_domain: mockURL.hostname,
        page_location: mockURL.toString(),
        page_path: mockURL.pathname,
        page_title: '',
        page_url: mockURL.toString(),
      },
      event_type: 'Page View',
    });
    expect(track).toHaveBeenCalledTimes(2);

    // Check that revisiting same url won't send another page view
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await (plugin as any).__trackHistoryPageView();
    expect(track).toHaveBeenCalledTimes(2);

    // Validate filter works
    const mockGoogleURL = new URL('https://www.google.com/path/to/page');
    mockWindowLocationFromURL(mockGoogleURL);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await (plugin as any).__trackHistoryPageView();
    expect(track).toHaveBeenCalledTimes(2);
  });
});

const mockWindowLocationFromURL = (url: URL) => {
  window.location.href = url.toString();
  window.location.search = url.search;
  window.location.hostname = url.hostname;
  window.location.pathname = url.pathname;
};
