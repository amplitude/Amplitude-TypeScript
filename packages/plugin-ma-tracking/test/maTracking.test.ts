import { AmplitudeBrowser } from '@amplitude/analytics-browser';
import { MATrackingPlugin } from '../src/ma-tracking';
import { AdvancedCampaignTracker } from '../src/advanced-campaign-tracker';

describe('MATrackingPlugin', () => {
  describe('attribution', () => {
    const API_KEY = 'API_KEY';
    const USER_ID = 'USER_ID';

    describe('setup', () => {
      describe('should send an identify event', () => {
        test('when a campaign changes', async () => {
          const instance = new AmplitudeBrowser();
          const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
            Promise.resolve({
              code: 200,
              message: '',
              event: {
                event_type: 'event_type',
              },
            }),
          );

          jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
            isNewCampaign: true,
            currentCampaign: { utm_source: 'amp-test' },
          });

          await instance.add(new MATrackingPlugin(instance));

          await instance.init(API_KEY, USER_ID);

          const sessionId = instance.getSessionId();

          expect(track).toHaveBeenCalledWith({
            event_type: '$identify',
            user_properties: {
              $set: {
                utm_source: 'amp-test',
              },
              $setOnce: {
                initial_fbclid: 'EMPTY',
                initial_gclid: 'EMPTY',
                initial_referrer: 'EMPTY',
                initial_referring_domain: 'EMPTY',
                initial_utm_campaign: 'EMPTY',
                initial_utm_content: 'EMPTY',
                initial_utm_medium: 'EMPTY',
                initial_utm_source: 'amp-test',
                initial_utm_term: 'EMPTY',
              },
              $unset: {
                fbclid: '-',
                gclid: '-',
                referrer: '-',
                referring_domain: '-',
                utm_campaign: '-',
                utm_content: '-',
                utm_medium: '-',
                utm_term: '-',
              },
            },
          });
          expect(track).toHaveBeenCalledTimes(1);
          expect(sessionId).toBe(sessionId);
        });

        test('when a campaign changes and attribution.trackNewCampaigns is true', async () => {
          const instance = new AmplitudeBrowser();
          const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
            Promise.resolve({
              code: 200,
              message: '',
              event: {
                event_type: 'event_type',
              },
            }),
          );

          jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
            isNewCampaign: true,
            currentCampaign: { utm_source: 'amp-test' },
          });

          await instance.add(
            new MATrackingPlugin(instance, {
              attribution: {
                trackNewCampaigns: true,
              },
            }),
          );

          await instance.init(API_KEY, USER_ID);

          const sessionId = instance.getSessionId();

          expect(track).toHaveBeenCalledWith({
            event_type: '$identify',
            user_properties: {
              $set: {
                utm_source: 'amp-test',
              },
              $setOnce: {
                initial_fbclid: 'EMPTY',
                initial_gclid: 'EMPTY',
                initial_referrer: 'EMPTY',
                initial_referring_domain: 'EMPTY',
                initial_utm_campaign: 'EMPTY',
                initial_utm_content: 'EMPTY',
                initial_utm_medium: 'EMPTY',
                initial_utm_source: 'amp-test',
                initial_utm_term: 'EMPTY',
              },
              $unset: {
                fbclid: '-',
                gclid: '-',
                referrer: '-',
                referring_domain: '-',
                utm_campaign: '-',
                utm_content: '-',
                utm_medium: '-',
                utm_term: '-',
              },
            },
          });
          expect(track).toHaveBeenCalledTimes(1);
          expect(instance.getSessionId()).toBe(sessionId);
        });

        test('when a campaign changes and reset session id', async () => {
          const instance = new AmplitudeBrowser();
          const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
            Promise.resolve({
              code: 200,
              message: '',
              event: {
                event_type: 'event_type',
              },
            }),
          );

          jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
            isNewCampaign: true,
            currentCampaign: { utm_source: 'amp-test' },
          });

          await instance.init(API_KEY, USER_ID, {
            attribution: {
              disabled: true,
            },
          });

          const sessionId = instance.getSessionId();

          await instance.add(
            new MATrackingPlugin(instance, {
              attribution: {
                resetSessionOnNewCampaign: true,
              },
            }),
          );

          expect(track).toHaveBeenCalledWith({
            event_type: '$identify',
            user_properties: {
              $set: {
                utm_source: 'amp-test',
              },
              $setOnce: {
                initial_fbclid: 'EMPTY',
                initial_gclid: 'EMPTY',
                initial_referrer: 'EMPTY',
                initial_referring_domain: 'EMPTY',
                initial_utm_campaign: 'EMPTY',
                initial_utm_content: 'EMPTY',
                initial_utm_medium: 'EMPTY',
                initial_utm_source: 'amp-test',
                initial_utm_term: 'EMPTY',
              },
              $unset: {
                fbclid: '-',
                gclid: '-',
                referrer: '-',
                referring_domain: '-',
                utm_campaign: '-',
                utm_content: '-',
                utm_medium: '-',
                utm_term: '-',
              },
            },
          });
          expect(track).toHaveBeenCalledTimes(1);
          expect(instance.getSessionId()).not.toBe(sessionId);
        });
      });

      describe('should not send an identify event', () => {
        test('when it is disabled', async () => {
          const instance = new AmplitudeBrowser();
          const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
            Promise.resolve({
              code: 200,
              message: '',
              event: {
                event_type: 'event_type',
              },
            }),
          );

          jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
            isNewCampaign: true,
            currentCampaign: { utm_source: 'amp-test' },
          });

          await instance.add(
            new MATrackingPlugin(instance, {
              attribution: {
                disabled: true,
              },
            }),
          );

          await instance.init(API_KEY, USER_ID);

          expect(track).toHaveBeenCalledTimes(0);
        });

        test('when a campaign does not change', async () => {
          const instance = new AmplitudeBrowser();
          const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
            Promise.resolve({
              code: 200,
              message: '',
              event: {
                event_type: 'event_type',
              },
            }),
          );

          jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
            isNewCampaign: false,
            currentCampaign: { utm_source: 'amp-test' },
          });

          await instance.add(new MATrackingPlugin(instance));

          await instance.init(API_KEY, USER_ID);

          expect(track).toHaveBeenCalledTimes(0);
        });
      });
    });

    describe('execute', () => {
      test('should return same event', async () => {
        const instance = new AmplitudeBrowser();

        jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        const plugin = new MATrackingPlugin(instance, {});
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
          const instance = new AmplitudeBrowser();
          const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
            Promise.resolve({
              code: 200,
              message: '',
              event: {
                event_type: 'event_type',
              },
            }),
          );

          jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
            isNewCampaign: true,
            currentCampaign: { utm_source: 'amp-test' },
          });

          await instance.add(
            new MATrackingPlugin(instance, {
              attribution: {
                disabled: true,
              },
              trackPageViews: {
                filter: 'onAttribution',
              },
            }),
          );

          await instance.init(API_KEY, USER_ID);

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
          const instance = new AmplitudeBrowser();
          const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
            Promise.resolve({
              code: 200,
              message: '',
              event: {
                event_type: 'event_type',
              },
            }),
          );

          jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
            isNewCampaign: true,
            currentCampaign: { utm_source: 'amp-test' },
          });

          await instance.add(
            new MATrackingPlugin(instance, {
              attribution: {
                disabled: true,
                trackPageViews: true,
              },
            }),
          );

          await instance.init(API_KEY, USER_ID);

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
          const instance = new AmplitudeBrowser();
          const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
            Promise.resolve({
              code: 200,
              message: '',
              event: {
                event_type: 'event_type',
              },
            }),
          );

          jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
            isNewCampaign: false,
            currentCampaign: { utm_source: 'amp-test' },
          });

          await instance.add(
            new MATrackingPlugin(instance, {
              attribution: {
                disabled: true,
              },
              trackPageViews: {
                filter: () => true,
              },
            }),
          );

          await instance.init(API_KEY, USER_ID);

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
          const instance = new AmplitudeBrowser();
          const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
            Promise.resolve({
              code: 200,
              message: '',
              event: {
                event_type: 'event_type',
              },
            }),
          );

          jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
            isNewCampaign: false,
            currentCampaign: { utm_source: 'amp-test' },
          });

          await instance.add(
            new MATrackingPlugin(instance, {
              attribution: {
                disabled: true,
              },
              trackPageViews: {},
            }),
          );

          await instance.init(API_KEY, USER_ID);

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
          const instance = new AmplitudeBrowser();
          const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
            Promise.resolve({
              code: 200,
              message: '',
              event: {
                event_type: 'event_type',
              },
            }),
          );

          jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
            isNewCampaign: false,
            currentCampaign: { utm_source: 'amp-test' },
          });

          await instance.add(
            new MATrackingPlugin(instance, {
              attribution: {
                disabled: true,
              },
              trackPageViews: true,
            }),
          );

          await instance.init(API_KEY, USER_ID);

          expect(track).toHaveBeenCalledTimes(1);
        });
      });

      describe('should not send a page view event', () => {
        test('when a campaign does not change and filter is "onAttribution"', async () => {
          const instance = new AmplitudeBrowser();
          const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
            Promise.resolve({
              code: 200,
              message: '',
              event: {
                event_type: 'event_type',
              },
            }),
          );

          jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
            isNewCampaign: false,
            currentCampaign: { utm_source: 'amp-test' },
          });

          await instance.add(
            new MATrackingPlugin(instance, {
              attribution: {
                disabled: true,
              },
              trackPageViews: {
                filter: 'onAttribution',
              },
            }),
          );

          await instance.init(API_KEY, USER_ID);

          expect(track).toHaveBeenCalledTimes(0);
        });

        test('when filter is a function and it returns false', async () => {
          const instance = new AmplitudeBrowser();
          const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
            Promise.resolve({
              code: 200,
              message: '',
              event: {
                event_type: 'event_type',
              },
            }),
          );

          jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
            isNewCampaign: true,
            currentCampaign: { utm_source: 'amp-test' },
          });

          await instance.add(
            new MATrackingPlugin(instance, {
              attribution: {
                disabled: true,
              },
              trackPageViews: {
                filter: () => false,
              },
            }),
          );

          await instance.init(API_KEY, USER_ID);

          expect(track).toHaveBeenCalledTimes(0);
        });

        test('when trackPageViews is false', async () => {
          const instance = new AmplitudeBrowser();
          const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
            Promise.resolve({
              code: 200,
              message: '',
              event: {
                event_type: 'event_type',
              },
            }),
          );

          jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
            isNewCampaign: true,
            currentCampaign: { utm_source: 'amp-test' },
          });

          await instance.add(
            new MATrackingPlugin(instance, {
              attribution: {
                disabled: true,
              },
              trackPageViews: false,
            }),
          );

          await instance.init(API_KEY, USER_ID);

          expect(track).toHaveBeenCalledTimes(0);
        });

        test('when trackPageViews is false and attribution.trackPageViews is true', async () => {
          const instance = new AmplitudeBrowser();
          const track = jest.spyOn(instance, 'track').mockReturnValueOnce(
            Promise.resolve({
              code: 200,
              message: '',
              event: {
                event_type: 'event_type',
              },
            }),
          );

          jest.spyOn(AdvancedCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
            isNewCampaign: true,
            currentCampaign: { utm_source: 'amp-test' },
          });

          await instance.add(
            new MATrackingPlugin(instance, {
              attribution: {
                disabled: true,
                trackPageViews: true,
              },
              trackPageViews: false,
            }),
          );

          await instance.init(API_KEY, USER_ID);

          expect(track).toHaveBeenCalledTimes(0);
        });
      });
    });
  });
});
