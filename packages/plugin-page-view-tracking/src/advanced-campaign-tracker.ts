import { Campaign, CampaignTrackerOptions } from '@amplitude/analytics-types';
import { CampaignTracker } from '@amplitude/analytics-client-common';

export class AdvancedCampaignTracker extends CampaignTracker {
  private _currentCampaign!: Campaign;
  private _isNewCampaign = true;
  ready: Promise<unknown>;

  constructor(apiKey: string, options: CampaignTrackerOptions) {
    super(apiKey, options);

    this.ready = new Promise((resolve) => resolve(this.refreshCampaignState()));
  }

  async onPageChange(callback: (state: { isNewCampaign: boolean; currentCampaign: Campaign }) => Promise<unknown>) {
    const currentState = await this.getCurrentState();
    await callback(currentState);

    if (currentState.isNewCampaign) {
      await this.saveCampaignToStorage(currentState.currentCampaign);
    }
  }

  private async getCurrentState() {
    await this.ready;
    return {
      isNewCampaign: this._isNewCampaign,
      currentCampaign: this._currentCampaign,
    };
  }

  private async refreshCampaignState() {
    try {
      this._currentCampaign = await this.parser.parse();
      this._isNewCampaign = this.isNewCampaign(this._currentCampaign, await this.getCampaignFromStorage());
    } catch {
      // nothing to do here
    }
  }
}
