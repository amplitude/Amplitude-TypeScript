import { AnalyticsConnector } from '@amplitude/analytics-connector';

export const getAnalyticsConnector = (instanceName = '$default_instance'): AnalyticsConnector => {
  return AnalyticsConnector.getInstance(instanceName);
};

export const setConnectorUserId = (userId: string | undefined, instanceName?: string): void => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  getAnalyticsConnector(instanceName).identityStore.editIdentity().setUserId(userId).commit();
};

export const setConnectorDeviceId = (deviceId: string, instanceName?: string): void => {
  getAnalyticsConnector(instanceName).identityStore.editIdentity().setDeviceId(deviceId).commit();
};
