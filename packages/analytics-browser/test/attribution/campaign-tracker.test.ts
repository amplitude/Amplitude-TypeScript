import { API_KEY, BASE_CAMPAIGN } from '../helpers/default';
import { CampaignTracker } from '../../src/attribution/campaign-tracker';
import { MemoryStorage } from '@amplitude/analytics-core';

describe('CampaignTracker', () => {
  describe('isNewCampaign', () => {
    test('should return true for new campaign', () => {
      const config = {
        apiKey: API_KEY,
      };
      const campaignTracker = new CampaignTracker(new MemoryStorage(), config);
      const previousCampaign = {
        ...BASE_CAMPAIGN,
      };
      const currentCampaign = {
        ...BASE_CAMPAIGN,
        utm_campaign: 'utm_campaign',
      };
      expect(campaignTracker.isNewCampaign(currentCampaign, previousCampaign)).toBe(true);
    });

    test('should return true for new referrer', () => {
      const config = {
        apiKey: API_KEY,
      };
      const campaignTracker = new CampaignTracker(new MemoryStorage(), config);
      const previousCampaign = {
        ...BASE_CAMPAIGN,
        utm_campaign: 'utm_campaign',
        referring_domain: 'a',
      };
      const currentCampaign = {
        ...BASE_CAMPAIGN,
        utm_campaign: 'utm_campaign',
        referring_domain: 'b',
      };
      expect(campaignTracker.isNewCampaign(currentCampaign, previousCampaign)).toBe(true);
    });

    test('should return false for no campaign', () => {
      const config = {
        apiKey: API_KEY,
      };
      const campaignTracker = new CampaignTracker(new MemoryStorage(), config);
      const previousCampaign = undefined;
      const currentCampaign = {
        ...BASE_CAMPAIGN,
      };
      expect(campaignTracker.isNewCampaign(currentCampaign, previousCampaign)).toBe(false);
    });

    test('should return false for excluded referrer', () => {
      const config = {
        apiKey: API_KEY,
        excludeReferrers: ['a'],
      };
      const campaignTracker = new CampaignTracker(new MemoryStorage(), config);
      const previousCampaign = {
        ...BASE_CAMPAIGN,
      };
      const currentCampaign = {
        ...BASE_CAMPAIGN,
        referring_domain: 'a',
      };
      expect(campaignTracker.isNewCampaign(currentCampaign, previousCampaign)).toBe(false);
    });
  });

  describe('saveCampaignToStorage', () => {
    test('should save campaign', () => {
      const config = {
        apiKey: API_KEY,
      };
      const campaignTracker = new CampaignTracker(new MemoryStorage(), config);
      const set = jest.spyOn(campaignTracker.storage, 'set');
      campaignTracker.saveCampaignToStorage({
        ...BASE_CAMPAIGN,
        utm_campaign: 'utm_campaign',
      });
      expect(set).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCampaignFromStorage', () => {
    test('should get campaign', () => {
      const config = {
        apiKey: API_KEY,
      };
      const campaignTracker = new CampaignTracker(new MemoryStorage(), config);
      const get = jest.spyOn(campaignTracker.storage, 'get');
      expect(campaignTracker.getCampaignFromStorage()).toEqual(undefined);
      expect(get).toHaveBeenCalledTimes(1);
    });
  });

  describe('convertCampaignToEvent', () => {
    test('should return identify event', () => {
      const config = {
        apiKey: API_KEY,
      };
      const campaignTracker = new CampaignTracker(new MemoryStorage(), config);
      const identifyEvent = campaignTracker.convertCampaignToEvent({
        ...BASE_CAMPAIGN,
        utm_campaign: 'utm_campaign',
      });
      expect(identifyEvent).toEqual({
        event_type: '$identify',
        user_id: undefined,
        user_properties: {
          $set: {
            utm_campaign: 'utm_campaign',
          },
          $setOnce: {
            initial_fbclid: 'EMPTY',
            initial_gclid: 'EMPTY',
            initial_referrer: 'EMPTY',
            initial_referring_domain: 'EMPTY',
            initial_utm_campaign: 'utm_campaign',
            initial_utm_content: 'EMPTY',
            initial_utm_medium: 'EMPTY',
            initial_utm_source: 'EMPTY',
            initial_utm_term: 'EMPTY',
          },
          $unset: {
            fbclid: '-',
            gclid: '-',
            referrer: '-',
            referring_domain: '-',
            utm_content: '-',
            utm_medium: '-',
            utm_source: '-',
            utm_term: '-',
          },
        },
      });
    });

    test('should return identify event with custom empty value', () => {
      const config = {
        apiKey: API_KEY,
        initialEmptyValue: '(none)',
      };
      const campaignTracker = new CampaignTracker(new MemoryStorage(), config);
      const identifyEvent = campaignTracker.convertCampaignToEvent({
        ...BASE_CAMPAIGN,
        utm_campaign: 'utm_campaign',
      });
      expect(identifyEvent).toEqual({
        event_type: '$identify',
        user_id: undefined,
        user_properties: {
          $set: {
            utm_campaign: 'utm_campaign',
          },
          $setOnce: {
            initial_fbclid: '(none)',
            initial_gclid: '(none)',
            initial_referrer: '(none)',
            initial_referring_domain: '(none)',
            initial_utm_campaign: 'utm_campaign',
            initial_utm_content: '(none)',
            initial_utm_medium: '(none)',
            initial_utm_source: '(none)',
            initial_utm_term: '(none)',
          },
          $unset: {
            fbclid: '-',
            gclid: '-',
            referrer: '-',
            referring_domain: '-',
            utm_content: '-',
            utm_medium: '-',
            utm_source: '-',
            utm_term: '-',
          },
        },
      });
    });
  });

  describe('trackCampaign', () => {
    test('should track campaign', async () => {
      const config = {
        apiKey: API_KEY,
      };
      const campaignTracker = new CampaignTracker(new MemoryStorage(), config);
      const parse = jest.spyOn(campaignTracker.campaignParser, 'parse');
      const saveCampaignToStorage = jest.spyOn(campaignTracker, 'saveCampaignToStorage');
      await campaignTracker.trackCampaign();
      expect(parse).toHaveBeenCalledTimes(1);
      expect(saveCampaignToStorage).toHaveBeenCalledTimes(1);
    });

    test('should call on new campaign', async () => {
      const onNewCampaign = jest.fn();
      const config = {
        apiKey: API_KEY,
        onNewCampaign,
      };
      const campaignTracker = new CampaignTracker(new MemoryStorage(), config);
      const getCampaignFromStorage = jest.spyOn(campaignTracker, 'getCampaignFromStorage');
      const parse = jest.spyOn(campaignTracker.campaignParser, 'parse');
      const isNewCampaign = jest.spyOn(campaignTracker, 'isNewCampaign').mockReturnValueOnce(true);
      const saveCampaignToStorage = jest.spyOn(campaignTracker, 'saveCampaignToStorage');
      await campaignTracker.trackCampaign();
      expect(getCampaignFromStorage).toHaveBeenCalledTimes(1);
      expect(parse).toHaveBeenCalledTimes(1);
      expect(isNewCampaign).toHaveBeenCalledTimes(1);
      expect(saveCampaignToStorage).toHaveBeenCalledTimes(1);
      expect(onNewCampaign).toHaveBeenCalledTimes(1);
    });

    test('should use custom tracker', async () => {
      const tracker = jest.fn().mockReturnValueOnce(Promise.resolve());
      const config = {
        apiKey: API_KEY,
        tracker,
      };
      const campaignTracker = new CampaignTracker(new MemoryStorage(), config);
      const parse = jest.spyOn(campaignTracker.campaignParser, 'parse');
      const saveCampaignToStorage = jest.spyOn(campaignTracker, 'saveCampaignToStorage');
      await campaignTracker.trackCampaign();
      expect(parse).toHaveBeenCalledTimes(1);
      expect(saveCampaignToStorage).toHaveBeenCalledTimes(1);
    });
  });
});
