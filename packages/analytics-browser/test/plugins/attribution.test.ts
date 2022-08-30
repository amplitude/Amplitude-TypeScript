import { CampaignTracker } from '../../src/attribution/campaign-tracker';
import { AmplitudeBrowser } from '../../src/browser-client';
import { Attribution } from '../../src/plugins/attribution';
import { useDefaultConfig } from '../helpers/default';

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

        jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        });

        const attribution = new Attribution();
        const config = useDefaultConfig();
        const sessionId = instance.getSessionId();
        await attribution.setup(config, { instance });

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

        jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        });

        const attribution = new Attribution({
          attribution: {
            trackNewCampaigns: true,
          },
        });
        const config = useDefaultConfig();
        const sessionId = instance.getSessionId();
        await attribution.setup(config, { instance });

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

      test('when a campaign changes but keep the same session id', async () => {
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

        jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        });

        const attribution = new Attribution({
          attribution: {
            resetSessionOnNewCampaign: true,
          },
        });
        const config = useDefaultConfig();
        const sessionId = instance.getSessionId();
        await attribution.setup(config, { instance });

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

        jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
          isNewCampaign: true,
          currentCampaign: { utm_source: 'amp-test' },
        });

        await instance.init(API_KEY, USER_ID, {
          attribution: {
            disabled: true,
          },
        });

        const attribution = new Attribution({
          attribution: {
            disabled: true,
          },
        });
        const config = useDefaultConfig();
        await attribution.setup(config, { instance });

        expect(track).toHaveBeenCalledTimes(0);
      });
    });
  });
});
