import { createInstance } from '@amplitude/analytics-browser';
import { PageViewTrackingPlugin } from '../src/page-view-tracking';
import { AdvancedCampaignTracker } from '../src/advanced-campaign-tracker';

describe('PageViewTrackingPlugin', () => {
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
      test('when a campaign changes and filter is "onAttribution"', async () => {
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

        jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.add(
          new PageViewTrackingPlugin(instance, {
            filter: 'onAttribution',
          }),
        ).promise;

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        }).promise;

        expect(track).toHaveBeenCalledWith({
          event_properties: {
            page_location: '',
            page_path: '',
            page_title: '',
          },
          event_type: 'Page View',
        });
        expect(track).toHaveBeenCalledTimes(1);
      });

      test('when a campaign changes, trackPageViews is undefined and attribution.trackPageViews is true', async () => {
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

        jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.add(new PageViewTrackingPlugin(instance)).promise;

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
            trackPageViews: true,
          },
        }).promise;

        expect(track).toHaveBeenCalledWith({
          event_properties: {
            page_location: '',
            page_path: '',
            page_title: '',
          },
          event_type: 'Page View',
        });
        expect(track).toHaveBeenCalledTimes(1);
      });

      test('when filter is a function and it returns true', async () => {
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

        jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: false,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.add(
          new PageViewTrackingPlugin(instance, {
            filter: () => true,
          }),
        ).promise;

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        }).promise;

        expect(track).toHaveBeenCalledWith({
          event_properties: {
            page_location: '',
            page_path: '',
            page_title: '',
          },
          event_type: 'Page View',
        });
        expect(track).toHaveBeenCalledTimes(1);
      });

      test('when filter is undefined', async () => {
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

        jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: false,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.add(new PageViewTrackingPlugin(instance, {})).promise;

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        }).promise;

        expect(track).toHaveBeenCalledWith({
          event_properties: {
            page_location: '',
            page_path: '',
            page_title: '',
          },
          event_type: 'Page View',
        });
        expect(track).toHaveBeenCalledTimes(1);
      });

      test('when attribution config is undefined', async () => {
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

        jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.add(new PageViewTrackingPlugin(instance, {})).promise;

        await instance.init(API_KEY, USER_ID).promise;

        expect(track).toHaveBeenCalledWith({
          event_properties: {
            page_location: '',
            page_path: '',
            page_title: '',
          },
          event_type: 'Page View',
        });
        expect(track).toHaveBeenCalledTimes(1);
      });
    });

    describe('should not send a page view event', () => {
      test('when a campaign does not change and filter is "onAttribution"', async () => {
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

        jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: false,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.add(
          new PageViewTrackingPlugin(instance, {
            filter: 'onAttribution',
          }),
        ).promise;

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        }).promise;

        expect(track).toHaveBeenCalledTimes(0);
      });

      test('when filter is a function and it returns false', async () => {
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

        jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.add(
          new PageViewTrackingPlugin(instance, {
            filter: () => false,
          }),
        ).promise;

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        }).promise;

        expect(track).toHaveBeenCalledTimes(0);
      });
    });
  });

  describe('execute', () => {
    test('should return same event', async () => {
      const instance = createInstance();

      jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
        isNewCampaign: true,
        currentCampaign: { utm_source: 'amp-test' },
      });

      const plugin = new PageViewTrackingPlugin(instance, {});
      const event = {
        event_properties: {
          page_location: '',
          page_path: '',
          page_title: '',
        },
        event_type: 'Page View',
      };
      const result = await plugin.execute(event);

      expect(result).toBe(event);
    });
  });
});
