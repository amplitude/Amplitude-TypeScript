import { Config } from '@amplitude/analytics-types';

const DEFAULT_INSTANCE = 'default';
const instances: Record<string, Config> = {};

export const createConfig = (apiKey: string, userId?: string): Config => {
  instances[DEFAULT_INSTANCE] = { apiKey, userId };
  return instances[DEFAULT_INSTANCE];
};

export const getConfig = (): Config => {
  return instances[DEFAULT_INSTANCE];
};
