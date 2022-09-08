import { MemoryStorage } from '@amplitude/analytics-core';
import { PluginCampaignTracker } from '../src/plugin-campaign-tracker';
import { Campaign } from '@amplitude/analytics-types';

describe('PluginCampaignTracker', () => {
  const API_KEY = 'API_KEY';

  describe('onPageChange', () => {
    test('should trigger callback', async () => {
      const config = {
        trackPageViews: false,
      };
      const storage = new MemoryStorage<Campaign>();
      const tracker = new PluginCampaignTracker(API_KEY, storage, config);
      await tracker.onPageChange(async ({ isNewCampaign }) => {
        expect(isNewCampaign).toBe(false);
      });
    });
  });
});
