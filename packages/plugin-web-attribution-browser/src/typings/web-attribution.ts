import { BeforePlugin, BrowserClient } from '@amplitude/analytics-types';

export interface Options {
  disabled?: boolean;
  excludeReferrers?: string[];
  initialEmptyValue?: string;
  resetSessionOnNewCampaign?: boolean;
}

export interface CreateWebAttributionPlugin {
  (client: BrowserClient, options?: Options): BeforePlugin;
  (options?: Options): BeforePlugin;
}

export type CreateWebAttributionPluginParameters = [BrowserClient, Options?] | [Options?];
