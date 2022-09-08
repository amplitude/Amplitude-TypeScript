import { AttributionBrowserOptions } from '@amplitude/analytics-types';

export interface AttributionPluginOptions extends AttributionBrowserOptions {
  resetSessionOnNewCampaign?: boolean;
}
