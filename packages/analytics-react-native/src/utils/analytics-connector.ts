import { AnalyticsConnector } from '@amplitude/analytics-connector';

export const getAnalyticsConnector = (): AnalyticsConnector => {
  return AnalyticsConnector.getInstance('$default_instance');
};
