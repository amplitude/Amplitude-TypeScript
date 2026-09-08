import { DEFAULT_INSTANCE_NAME } from '../types/constants';

export const normalizeInstanceName = (instanceName?: string): string => {
  return instanceName === undefined || instanceName === '' ? DEFAULT_INSTANCE_NAME : instanceName;
};
