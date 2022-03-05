import { Config } from '@amplitude/analytics-types';
import { Http } from './transports/http';

const DEFAULT_INSTANCE = 'default';
const instances: Record<string, Config> = {};

const AMPLITUDE_SERVER_URL = 'https://api2.amplitude.com/2/httpapi';

const defaultConfig = {
  flushMaxRetries: 5,
  flushQueueSize: 10,
  flushIntervalMillis: 1000,
  serverUrl: AMPLITUDE_SERVER_URL,
  transportProvider: new Http(),
};

export const createConfig = (
  apiKey: string,
  userId?: string,
  options?: Partial<Exclude<Config, 'apiKey' | 'userId'>>,
): Config => {
  instances[DEFAULT_INSTANCE] = {
    apiKey,
    userId,
    ...defaultConfig,
    ...options,
  };
  return instances[DEFAULT_INSTANCE];
};

export const getConfig = (): Config => {
  return instances[DEFAULT_INSTANCE];
};
