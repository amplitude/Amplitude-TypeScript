import { AttributionBrowserOptions, Campaign } from '@amplitude/analytics-types';
import { CampaignTracker } from '@amplitude/analytics-client-common';
import { BASE_CAMPAIGN } from './constant';
import { Storage } from '@amplitude/analytics-types';

export class PluginCampaignTracker {
  private _currentCampaign: Campaign = {
    ...BASE_CAMPAIGN,
  };
  private _isNewCampaign = true;
  ready: Promise<unknown>;
  campaignTracker: CampaignTracker;

  constructor(apiKey: string, storage: Storage<Campaign>, options: AttributionBrowserOptions) {
    this.campaignTracker = new CampaignTracker(apiKey, {
      ...options,
      trackPageViews: false,
      track: /* istanbul ignore next */ () => Promise.resolve(),
      onNewCampaign: /* istanbul ignore next */ () => () => undefined,
      storage,
    });
    this.ready = new Promise((resolve) => resolve(this.refreshCampaignState()));
  }

  createCampaignEvent(currentCampaign: Campaign) {
    return this.campaignTracker.createCampaignEvent(currentCampaign);
  }

  async onPageChange(callback: (state: { isNewCampaign: boolean; currentCampaign: Campaign }) => Promise<unknown>) {
    const currentState = await this.getCurrentState();
    await callback(currentState);

    if (currentState.isNewCampaign) {
      await this.campaignTracker.saveCampaignToStorage(currentState.currentCampaign);
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
      this._currentCampaign = await this.campaignTracker.parser.parse();
      this._isNewCampaign = this.campaignTracker.isNewCampaign(
        this._currentCampaign,
        await this.campaignTracker.getCampaignFromStorage(),
      );
    } catch {
      // nothing to do here
    }
  }
}
