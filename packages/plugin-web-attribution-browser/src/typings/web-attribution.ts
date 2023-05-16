import { BeforePlugin } from '@amplitude/analytics-types';

export interface Options {
  excludeReferrers?: string[];
  initialEmptyValue?: string;
  resetSessionOnNewCampaign?: boolean;
}

export interface CreateWebAttributionPlugin {
  (options?: Options): BeforePlugin;
}
