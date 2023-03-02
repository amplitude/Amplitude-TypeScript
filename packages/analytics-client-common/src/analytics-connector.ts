import { AnalyticsConnector } from '@amplitude/analytics-connector';

export const getAnalyticsConnector = (): AnalyticsConnector => {
  return AnalyticsConnector.getInstance('$default_instance');
};

export const setConnectorUserId = (userId: string | undefined): void => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  getAnalyticsConnector().identityStore.editIdentity().setUserId(userId).commit();
};

export const setConnectorDeviceId = (deviceId: string): void => {
  getAnalyticsConnector().identityStore.editIdentity().setDeviceId(deviceId).commit();
};
