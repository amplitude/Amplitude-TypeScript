import { BeforePlugin } from '@amplitude/analytics-types';

export const DEFAULT_SESSION_START_EVENT = 'session_start';

export interface Options {
  excludeReferrers?: (string | RegExp)[];
  initialEmptyValue?: string;
  resetSessionOnNewCampaign?: boolean;
}

export interface CreateWebAttributionPlugin {
  (options?: Options): BeforePlugin;
}
