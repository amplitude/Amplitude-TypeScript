import { AttributionBrowserOptions } from '@amplitude/analytics-types';

export interface AttributionPluginOptions extends AttributionBrowserOptions {
  disabled?: boolean;
  excludeReferrers?: string[];
  initialEmptyValue?: string;
  resetSessionOnNewCampaign?: boolean;
}
