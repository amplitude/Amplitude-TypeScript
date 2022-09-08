import { MemoryStorage } from '@amplitude/analytics-core';
import { AdvancedCampaignTracker } from '../src/advanced-campaign-tracker';
import { Campaign } from '@amplitude/analytics-types';

describe('AdvancedCampaignTracker', () => {
  const API_KEY = 'API_KEY';

  describe('onPageChange', () => {
    test('should trigger callback', async () => {
      const config = {
        trackPageViews: false,
        storage: new MemoryStorage<Campaign>(),
        track: jest.fn(),
        onNewCampaign: jest.fn(),
      };

      const tracker = new AdvancedCampaignTracker(API_KEY, config);
      await tracker.onPageChange(async ({ isNewCampaign }) => {
        expect(isNewCampaign).toBe(false);
      });
    });
  });
});
