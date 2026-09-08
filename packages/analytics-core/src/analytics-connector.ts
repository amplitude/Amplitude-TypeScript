import { AnalyticsConnector } from '@amplitude/analytics-connector';
import { normalizeInstanceName } from './utils/instance-name';

export const getAnalyticsConnector = (instanceName?: string): AnalyticsConnector => {
  return AnalyticsConnector.getInstance(normalizeInstanceName(instanceName));
};

export const setConnectorUserId = (userId: string | undefined, instanceName?: string): void => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  getAnalyticsConnector(instanceName).identityStore.editIdentity().setUserId(userId).commit();
};

export const setConnectorDeviceId = (deviceId: string, instanceName?: string): void => {
  getAnalyticsConnector(instanceName).identityStore.editIdentity().setDeviceId(deviceId).commit();
};
