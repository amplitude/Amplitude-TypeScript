import { API_KEY } from '../helpers/default';
import { CampaignTracker } from '../../src/attribution/campaign-tracker';
import { BASE_CAMPAIGN } from '../../src/attribution/constants';
import { MemoryStorage } from '@amplitude/analytics-core';
import { Campaign } from '@amplitude/analytics-types';

describe('CampaignTracker', () => {
  describe('isNewCampaign', () => {
    test('should return true for new campaign', () => {
      const config = {
        storage: new MemoryStorage<Campaign>(),
        track: jest.fn(),
        onNewCampaign: jest.fn(),
      };
      const campaignTracker = new CampaignTracker(API_KEY, config);
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
        storage: new MemoryStorage<Campaign>(),
        track: jest.fn(),
        onNewCampaign: jest.fn(),
      };
      const campaignTracker = new CampaignTracker(API_KEY, config);
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

    test('should return false for excluded referrer', () => {
      const config = {
        storage: new MemoryStorage<Campaign>(),
        track: jest.fn(),
        onNewCampaign: jest.fn(),
        excludeReferrers: ['a'],
      };
      const campaignTracker = new CampaignTracker(API_KEY, config);
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
    test('should save campaign', async () => {
      const config = {
        storage: new MemoryStorage<Campaign>(),
        track: jest.fn(),
        onNewCampaign: jest.fn(),
      };
      const campaignTracker = new CampaignTracker(API_KEY, config);
      const set = jest.spyOn(campaignTracker.storage, 'set');
      await campaignTracker.saveCampaignToStorage({
        ...BASE_CAMPAIGN,
        utm_campaign: 'utm_campaign',
      });
      expect(set).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCampaignFromStorage', () => {
    test('should get campaign', () => {
      const config = {
        storage: new MemoryStorage<Campaign>(),
        track: jest.fn(),
        onNewCampaign: jest.fn(),
      };
      const campaignTracker = new CampaignTracker(API_KEY, config);
      const get = jest.spyOn(campaignTracker.storage, 'get');
      expect(campaignTracker.getCampaignFromStorage()).toEqual({
        ...BASE_CAMPAIGN,
      });
      expect(get).toHaveBeenCalledTimes(1);
    });
  });

  describe('createCampaignEvent', () => {
    test('should return event', () => {
      const config = {
        storage: new MemoryStorage<Campaign>(),
        track: jest.fn(),
        onNewCampaign: jest.fn(),
      };
      const campaignTracker = new CampaignTracker(API_KEY, config);
      const campaignEvent = campaignTracker.createCampaignEvent({
        ...BASE_CAMPAIGN,
        utm_campaign: 'utm_campaign',
      });
      expect(campaignEvent).toEqual({
        event_type: 'Page View',
        event_properties: {
          page_location: 'http://localhost/',
          page_path: '/',
          page_title: '',
        },
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

    test('should return event with custom empty value', () => {
      const config = {
        storage: new MemoryStorage<Campaign>(),
        track: jest.fn(),
        onNewCampaign: jest.fn(),
        initialEmptyValue: '(none)',
        trackPageViews: false,
      };
      const campaignTracker = new CampaignTracker(API_KEY, config);
      const campaignEvent = campaignTracker.createCampaignEvent({
        ...BASE_CAMPAIGN,
        utm_campaign: 'utm_campaign',
      });
      expect(campaignEvent).toEqual({
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

  describe('send', () => {
    test('should force track', async () => {
      const config = {
        storage: new MemoryStorage<Campaign>(),
        track: jest.fn(),
        onNewCampaign: jest.fn(),
      };
      const campaignTracker = new CampaignTracker(API_KEY, config);
      const track = jest.spyOn(campaignTracker, 'track').mockReturnValueOnce(Promise.resolve());
      const saveCampaignToStorage = jest
        .spyOn(campaignTracker, 'saveCampaignToStorage')
        .mockResolvedValueOnce(undefined);
      await campaignTracker.send(true);
      expect(track).toHaveBeenCalledTimes(1);
      expect(saveCampaignToStorage).toHaveBeenCalledTimes(1);
    });

    test('should track new campaigns', async () => {
      const onNewCampaign = jest.fn();
      const config = {
        storage: new MemoryStorage<Campaign>(),
        track: jest.fn(),
        onNewCampaign,
        trackNewCampaigns: true,
      };
      const campaignTracker = new CampaignTracker(API_KEY, config);
      const isNewCampaign = jest.spyOn(campaignTracker, 'isNewCampaign').mockReturnValueOnce(true);
      const track = jest.spyOn(campaignTracker, 'track').mockReturnValueOnce(Promise.resolve());
      const saveCampaignToStorage = jest
        .spyOn(campaignTracker, 'saveCampaignToStorage')
        .mockResolvedValueOnce(undefined);
      await campaignTracker.send(false);
      expect(onNewCampaign).toHaveBeenCalledTimes(1);
      expect(isNewCampaign).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledTimes(1);
      expect(saveCampaignToStorage).toHaveBeenCalledTimes(1);
    });

    test('should not track same campaigns', async () => {
      const onNewCampaign = jest.fn();
      const config = {
        storage: new MemoryStorage<Campaign>(),
        track: jest.fn(),
        onNewCampaign,
        trackNewCampaigns: true,
      };
      const campaignTracker = new CampaignTracker(API_KEY, config);
      const isNewCampaign = jest.spyOn(campaignTracker, 'isNewCampaign').mockReturnValueOnce(false);
      const track = jest.spyOn(campaignTracker, 'track').mockReturnValueOnce(Promise.resolve());
      const saveCampaignToStorage = jest
        .spyOn(campaignTracker, 'saveCampaignToStorage')
        .mockResolvedValueOnce(undefined);
      await campaignTracker.send(false);
      expect(onNewCampaign).toHaveBeenCalledTimes(0);
      expect(isNewCampaign).toHaveBeenCalledTimes(1);
      expect(track).toHaveBeenCalledTimes(0);
      expect(saveCampaignToStorage).toHaveBeenCalledTimes(0);
    });

    test('should not track new campaigns', async () => {
      const onNewCampaign = jest.fn();
      const config = {
        storage: new MemoryStorage<Campaign>(),
        track: jest.fn(),
        onNewCampaign,
        trackNewCampaigns: false,
      };
      const campaignTracker = new CampaignTracker(API_KEY, config);
      const track = jest.spyOn(campaignTracker, 'track').mockReturnValueOnce(Promise.resolve());
      const saveCampaignToStorage = jest
        .spyOn(campaignTracker, 'saveCampaignToStorage')
        .mockResolvedValueOnce(undefined);
      await campaignTracker.send(false);
      expect(onNewCampaign).toHaveBeenCalledTimes(0);
      expect(track).toHaveBeenCalledTimes(0);
      expect(saveCampaignToStorage).toHaveBeenCalledTimes(0);
    });
  });
});
