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
    test('should get campaign', async () => {
      const config = {
        storage: new MemoryStorage<Campaign>(),
      };
      const campaignTracker = new CampaignTracker(API_KEY, config);
      const get = jest.spyOn(campaignTracker.storage, 'get');
      expect(await campaignTracker.getCampaignFromStorage()).toEqual({
        ...BASE_CAMPAIGN,
      });
      expect(get).toHaveBeenCalledTimes(1);
    });
  });

  describe('createCampaignEvent', () => {
    test('should return event', () => {
      const config = {
        storage: new MemoryStorage<Campaign>(),
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
        initialEmptyValue: '(none)',
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

  describe('trackOn', () => {
    test('should trigger callback when mode is onAttribution and campaign changes', async () => {
      const config = {
        storage: new MemoryStorage<Campaign>(),
      };
      const callback = jest.fn();
      jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
        isNewCampaign: true,
        currentCampaign: { utm_source: 'amp-test' },
      });
      const campaignTracker = new CampaignTracker(API_KEY, config);
      await campaignTracker.trackOn('onAttribution', callback);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('should not trigger callback when mode is onAttribution but campaign does not change', async () => {
      const config = {
        storage: new MemoryStorage<Campaign>(),
      };
      const callback = jest.fn();
      jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
        isNewCampaign: false,
        currentCampaign: { utm_source: 'amp-test' },
      });
      const campaignTracker = new CampaignTracker(API_KEY, config);
      await campaignTracker.trackOn('onAttribution', callback);

      expect(callback).toHaveBeenCalledTimes(0);
    });

    test('should trigger callback when mode is a function and it returns true', async () => {
      const config = {
        storage: new MemoryStorage<Campaign>(),
      };
      const callback = jest.fn();
      jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
        isNewCampaign: false,
        currentCampaign: { utm_source: 'amp-test' },
      });
      const campaignTracker = new CampaignTracker(API_KEY, config);
      await campaignTracker.trackOn(() => true, callback);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    test('should not trigger callback when mode is a function but it returns false', async () => {
      const config = {
        storage: new MemoryStorage<Campaign>(),
      };
      const callback = jest.fn();
      jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
        isNewCampaign: false,
        currentCampaign: { utm_source: 'amp-test' },
      });
      const campaignTracker = new CampaignTracker(API_KEY, config);
      await campaignTracker.trackOn(() => false, callback);

      expect(callback).toHaveBeenCalledTimes(0);
    });

    test('should trigger callback when mode is undefined', async () => {
      const config = {
        storage: new MemoryStorage<Campaign>(),
      };
      const callback = jest.fn();
      jest.spyOn(CampaignTracker.prototype as any, 'getCurrentState').mockReturnValue({
        isNewCampaign: false,
        currentCampaign: { utm_source: 'amp-test' },
      });
      const campaignTracker = new CampaignTracker(API_KEY, config);
      await campaignTracker.trackOn(undefined, callback);

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
