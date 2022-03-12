import { Config, InitOptions, LogLevel } from '@amplitude/analytics-types';
import { Logger } from './logger';

const DEFAULT_INSTANCE = 'default';
const instances: Record<string, Config> = {};

const AMPLITUDE_SERVER_URL = 'https://api2.amplitude.com/2/httpapi';

const defaultConfig = {
  flushMaxRetries: 5,
  flushQueueSize: 10,
  flushIntervalMillis: 1000,
  serverUrl: AMPLITUDE_SERVER_URL,
  logLevel: LogLevel.Warn,
  logger: new Logger(),
};

export const createConfig = <T extends Config>(
  apiKey: string,
  userId: string | undefined,
  overrides: InitOptions<T>,
): T => {
  const baseConfig = {
    ...defaultConfig,
    ...overrides,
  };
  instances[DEFAULT_INSTANCE] = {
    apiKey,
    userId,
    ...baseConfig,
  };
  baseConfig.logger.enable(baseConfig.logLevel);
  baseConfig.logger.error('hoy');
  return instances[DEFAULT_INSTANCE] as T;
};

export const getConfig = <T extends Config>(): T => {
  return instances[DEFAULT_INSTANCE] as T;
};
