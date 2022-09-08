import { createInstance } from '@amplitude/analytics-browser';
import { WebAttributionPlugin } from '../src/web-attribution';
import { PluginCampaignTracker } from '../src/plugin-campaign-tracker';

describe('WebAttributionPlugin', () => {
  const API_KEY = 'API_KEY';
  const USER_ID = 'USER_ID';

  describe('setup', () => {
    describe('should send an identify event', () => {
      test('when a campaign changes', async () => {
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

        jest.spyOn(PluginCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.add(new WebAttributionPlugin(instance)).promise;

        await instance.init(API_KEY, USER_ID).promise;

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

        jest.spyOn(PluginCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.add(
          new WebAttributionPlugin(instance, {
            trackNewCampaigns: true,
          }),
        ).promise;

        await instance.init(API_KEY, USER_ID).promise;

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

        jest.spyOn(PluginCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        const sessionId = instance.getSessionId();

        await instance.add(
          new WebAttributionPlugin(instance, {
            resetSessionOnNewCampaign: true,
          }),
        ).promise;

        await instance.init(API_KEY, USER_ID).promise;

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
      test('when a campaign does not change', async () => {
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

        jest.spyOn(PluginCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: false,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.add(new WebAttributionPlugin(instance)).promise;

        await instance.init(API_KEY, USER_ID).promise;

        expect(track).toHaveBeenCalledTimes(0);
      });
    });
  });

  describe('execute', () => {
    test('should return same event', async () => {
      const instance = createInstance();

      jest.spyOn(PluginCampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
        isNewCampaign: true,
        currentCampaign: { utm_source: 'amp-test' },
      });

      const plugin = new WebAttributionPlugin(instance, {});
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
