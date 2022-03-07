import { Config, InitOptions } from '@amplitude/analytics-types';

const DEFAULT_INSTANCE = 'default';
const instances: Record<string, Config> = {};

const AMPLITUDE_SERVER_URL = 'https://api2.amplitude.com/2/httpapi';

const defaultConfig = {
  flushMaxRetries: 5,
  flushQueueSize: 10,
  flushIntervalMillis: 1000,
  serverUrl: AMPLITUDE_SERVER_URL,
};

export const createConfig = <T extends Config>(
  apiKey: string,
  userId: string | undefined,
  options: InitOptions<T>,
): T => {
  instances[DEFAULT_INSTANCE] = {
    apiKey,
    userId,
    ...defaultConfig,
    ...options,
  };
  return instances[DEFAULT_INSTANCE] as T;
};

export const getConfig = <T extends Config>(): T => {
  return instances[DEFAULT_INSTANCE] as T;
};
