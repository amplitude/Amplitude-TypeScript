import {
  Config as IConfig,
  Event,
  InitOptions,
  Logger as ILogger,
  LogLevel,
  Storage,
  Transport,
} from '@amplitude/analytics-types';
import { Logger } from './logger';

const DEFAULT_INSTANCE = 'default';
const instances: Record<string, IConfig> = {};

const AMPLITUDE_SERVER_URL = 'https://api2.amplitude.com/2/httpapi';

export const defaultConfig = {
  flushMaxRetries: 5,
  flushQueueSize: 10,
  flushIntervalMillis: 1000,
  serverUrl: AMPLITUDE_SERVER_URL,
  logLevel: LogLevel.Warn,
  logger: new Logger(),
};

export class Config implements IConfig {
  apiKey: string;
  userId?: string;
  deviceId?: string;
  sessionId?: number;
  flushIntervalMillis: number;
  flushMaxRetries: number;
  flushQueueSize: number;
  logger: ILogger;
  logLevel: LogLevel;
  serverUrl: string;
  transportProvider: Transport;
  storageProvider: Storage<Event[]>;

  constructor(options: InitOptions<IConfig>) {
    this.apiKey = options.apiKey;
    this.userId = options.userId;
    this.deviceId = options.deviceId;
    this.sessionId = options.sessionId;
    this.flushIntervalMillis = options.flushIntervalMillis || defaultConfig.flushIntervalMillis;
    this.flushMaxRetries = options.flushMaxRetries || defaultConfig.flushMaxRetries;
    this.flushQueueSize = options.flushQueueSize || defaultConfig.flushQueueSize;
    this.logger = options.logger || defaultConfig.logger;
    this.logLevel = options.logLevel || defaultConfig.logLevel;
    this.serverUrl = options.serverUrl || AMPLITUDE_SERVER_URL;
    this.transportProvider = options.transportProvider;
    this.storageProvider = options.storageProvider;

    this.logger.enable(this.logLevel);
  }
}

export const createConfig = (options: InitOptions<IConfig>) => {
  instances[DEFAULT_INSTANCE] = new Config(options);
  return instances[DEFAULT_INSTANCE];
};

export const getConfig = () => {
  return instances[DEFAULT_INSTANCE];
};

export const resetInstances = () => {
  for (const name in instances) {
    delete instances[name];
  }
};
