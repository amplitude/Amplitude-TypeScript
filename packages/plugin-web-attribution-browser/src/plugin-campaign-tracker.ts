import { AttributionOptions, Campaign } from '@amplitude/analytics-types';
import { CampaignTracker } from '@amplitude/analytics-client-common';
import { Storage } from '@amplitude/analytics-types';

export class PluginCampaignTracker {
  campaignTracker: CampaignTracker;

  constructor(apiKey: string, storage: Storage<Campaign>, options: AttributionOptions) {
    this.campaignTracker = new CampaignTracker(apiKey, {
      ...options,
      trackPageViews: false,
      track: /* istanbul ignore next */ () => Promise.resolve(),
      onNewCampaign: /* istanbul ignore next */ () => () => undefined,
      storage,
    });
  }

  createCampaignEvent(currentCampaign: Campaign) {
    return this.campaignTracker.createCampaignEvent(currentCampaign);
  }

  async onPageChange(callback: (state: { isNewCampaign: boolean; currentCampaign: Campaign }) => Promise<unknown>) {
    await callback(await this.getCurrentState());

    const currentState = await this.getCurrentState();
    if (currentState.isNewCampaign) {
      void this.campaignTracker.saveCampaignToStorage(currentState.currentCampaign);
    }
  }

  private async getCurrentState() {
    const currentCampaign = await this.campaignTracker.parser.parse();
    const isNewCampaign = this.campaignTracker.isNewCampaign(
      currentCampaign,
      await this.campaignTracker.getCampaignFromStorage(),
      true,
    );
    return {
      isNewCampaign,
      currentCampaign,
    };
  }
}
