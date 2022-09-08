import { Campaign, CampaignTrackerOptions } from '@amplitude/analytics-types';

export interface CampaignTracker extends CampaignTrackerOptions {
  onPageChange: (
    callback: (state: { isNewCampaign: boolean; currentCampaign: Campaign }) => Promise<unknown>,
  ) => Promise<void>;
}
