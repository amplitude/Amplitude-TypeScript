import { createInstance } from '@amplitude/analytics-browser';
import { pageViewTrackingPlugin } from '../src/page-view-tracking';

describe('pageViewTrackingPlugin', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: '',
        href: '',
        pathname: '',
        search: '',
        writable: true,
      },
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: '',
        href: '',
        pathname: '',
        search: '',
        writable: false,
      },
    });
  });

  const API_KEY = 'API_KEY';
  const USER_ID = 'USER_ID';

  describe('setup', () => {
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
              initial_gclid: 'EMPTY',
              initial_ko_click_id: 'EMPTY',
              initial_msclkid: 'EMPTY',
              initial_referrer: 'EMPTY',
              initial_referring_domain: 'EMPTY',
              initial_ttclid: 'EMPTY',
              initial_twclid: 'EMPTY',
              initial_utm_campaign: 'EMPTY',
              initial_utm_content: 'EMPTY',
              initial_utm_medium: 'EMPTY',
              initial_utm_source: 'amp-test',
              initial_utm_term: 'EMPTY',
            },
            $unset: {
              dclid: '-',
              fbclid: '-',
              gclid: '-',
              ko_click_id: '-',
              msclkid: '-',
              referrer: '-',
              referring_domain: '-',
              ttclid: '-',
              twclid: '-',
              utm_campaign: '-',
              utm_content: '-',
              utm_medium: '-',
              utm_term: '-',
            },
          },
        });
        expect(event.event_type).toBe('Page View');
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
              initial_gclid: 'EMPTY',
              initial_ko_click_id: 'EMPTY',
              initial_msclkid: 'EMPTY',
              initial_referrer: 'EMPTY',
              initial_referring_domain: 'EMPTY',
              initial_ttclid: 'EMPTY',
              initial_twclid: 'EMPTY',
              initial_utm_campaign: 'EMPTY',
              initial_utm_content: 'EMPTY',
              initial_utm_medium: 'EMPTY',
              initial_utm_source: 'amp-test',
              initial_utm_term: 'EMPTY',
            },
            $unset: {
              dclid: '-',
              fbclid: '-',
              gclid: '-',
              ko_click_id: '-',
              msclkid: '-',
              referrer: '-',
              referring_domain: '-',
              ttclid: '-',
              twclid: '-',
              utm_campaign: '-',
              utm_content: '-',
              utm_medium: '-',
              utm_term: '-',
            },
          },
        });
        expect(event.event_type).toBe('Page View');
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
          event_type: 'Page View',
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
      window.location.href = url.toString();
      window.location.search = url.search;
      window.location.hostname = url.hostname;
      window.location.pathname = url.pathname;
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
});
