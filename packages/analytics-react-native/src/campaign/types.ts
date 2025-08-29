import { Campaign, ReactNativeAttributionOptions, Storage, BaseEvent } from '@amplitude/analytics-core';

export interface CampaignTrackerOptions extends ReactNativeAttributionOptions {
  storage: Storage<Campaign>;
  track: CampaignTrackFunction;
  onNewCampaign: (campaign: Campaign) => unknown;
}

export interface CampaignTracker extends CampaignTrackerOptions {
  send(force: boolean): Promise<void>;
}

export type CampaignTrackFunction = (event: BaseEvent) => Promise<unknown>;
