import { PageTracking } from '../../src/plugins/pageTracking';
import { CampaignTracker } from '../../src/attribution/campaign-tracker';
import { AmplitudeReactNative } from '../../src/react-native-client';
import { useDefaultConfig } from '../helpers/default';

describe('pageTracking', () => {
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
        const instance = new AmplitudeReactNative();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
          Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        );

        jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        });

        const pageTracking = new PageTracking({
          trackPageViews: {
            filter: 'onAttribution',
          },
        });
        const config = useDefaultConfig();
        await pageTracking.setup(config, { instance });

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

      test('when a campaign changes, filter is undefined and attribution.trackPageViews is true', async () => {
        const instance = new AmplitudeReactNative();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
          Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        );

        jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        });

        const pageTracking = new PageTracking({
          attribution: {
            trackPageViews: true,
          },
          trackPageViews: true,
        });
        const config = useDefaultConfig();
        await pageTracking.setup(config, { instance });

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
        const instance = new AmplitudeReactNative();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
          Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        );

        jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        });

        const pageTracking = new PageTracking({
          trackPageViews: {
            filter: () => true,
          },
        });
        const config = useDefaultConfig();
        await pageTracking.setup(config, { instance });

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
        const instance = new AmplitudeReactNative();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
          Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        );

        jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: false,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        });

        const pageTracking = new PageTracking({
          trackPageViews: {},
        });
        const config = useDefaultConfig();
        await pageTracking.setup(config, { instance });

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

      test('when trackPageViews is true', async () => {
        const instance = new AmplitudeReactNative();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
          Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        );

        jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        });

        const pageTracking = new PageTracking({
          trackPageViews: true,
        });
        const config = useDefaultConfig();
        await pageTracking.setup(config, { instance });

        expect(track).toHaveBeenCalledTimes(1);
      });
    });

    describe('should not send a page view event', () => {
      test('when a campaign does not change and filter is "onAttribution"', async () => {
        const instance = new AmplitudeReactNative();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
          Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        );

        jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: false,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        });

        const pageTracking = new PageTracking({
          trackPageViews: {
            filter: 'onAttribution',
          },
        });
        const config = useDefaultConfig();
        await pageTracking.setup(config, { instance });

        expect(track).toHaveBeenCalledTimes(0);
      });

      test('when filter is a function and it returns false', async () => {
        const instance = new AmplitudeReactNative();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
          Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        );

        jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        });

        const pageTracking = new PageTracking({
          trackPageViews: {
            filter: () => false,
          },
        });
        const config = useDefaultConfig();
        await pageTracking.setup(config, { instance });

        expect(track).toHaveBeenCalledTimes(0);
      });

      test('when trackPageViews is false', async () => {
        const instance = new AmplitudeReactNative();
        const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
          Promise.resolve({
            code: 200,
            message: '',
            event: {
              event_type: 'event_type',
            },
          }),
        );

        jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        });

        const pageTracking = new PageTracking({
          trackPageViews: false,
        });
        const config = useDefaultConfig();
        await pageTracking.setup(config, { instance });

        expect(track).toHaveBeenCalledTimes(0);
      });
    });
  });
});
