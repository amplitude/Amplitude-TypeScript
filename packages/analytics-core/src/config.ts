import { OfflineDisabled } from './types/offline';
import { ServerZoneType } from './types/server-zone';
import { Transport } from './types/transport';
import { Event } from './types/event/event';
import { Plan } from './types/event/plan';
import { IngestionMetadata } from './types/event/ingestion-metadata';
import { Storage } from './types/storage';
import {
  AMPLITUDE_SERVER_URL,
  AMPLITUDE_BATCH_SERVER_URL,
  EU_AMPLITUDE_SERVER_URL,
  EU_AMPLITUDE_BATCH_SERVER_URL,
  DEFAULT_INSTANCE_NAME,
} from './types/constants';

import { Logger, ILogger } from './logger';
import { LogLevel } from './types/loglevel';
import { ConfigOptions, IRequestMetadata, IHistogramOptions, HistogramKey } from './types/config/core-config';
import { IConfig } from './types/config/core-config';

export const getDefaultConfig = () => ({
  flushMaxRetries: 12,
  flushQueueSize: 200,
  flushIntervalMillis: 10000,
  instanceName: DEFAULT_INSTANCE_NAME,
  logLevel: LogLevel.Warn,
  loggerProvider: new Logger(),
  offline: false,
  optOut: false,
  serverUrl: AMPLITUDE_SERVER_URL,
  serverZone: 'US' as ServerZoneType,
  useBatch: false,
});
export class Config implements IConfig {
  apiKey: string;
  flushIntervalMillis: number;
  flushMaxRetries: number;
  flushQueueSize: number;
  instanceName?: string;
  loggerProvider: ILogger;
  logLevel: LogLevel;
  minIdLength?: number;
  offline?: boolean | typeof OfflineDisabled;
  plan?: Plan;
  ingestionMetadata?: IngestionMetadata;
  serverUrl: string | undefined;
  serverZone?: ServerZoneType;
  transportProvider: Transport;
  storageProvider?: Storage<Event[]>;
  useBatch: boolean;
  requestMetadata?: RequestMetadata;

  protected _optOut = false;
  get optOut() {
    return this._optOut;
  }
  set optOut(optOut: boolean) {
    this._optOut = optOut;
  }

  constructor(options: ConfigOptions) {
    const defaultConfig = getDefaultConfig();
    this.apiKey = options.apiKey;
    this.flushIntervalMillis = options.flushIntervalMillis ?? defaultConfig.flushIntervalMillis;
    this.flushMaxRetries = options.flushMaxRetries || defaultConfig.flushMaxRetries;
    this.flushQueueSize = options.flushQueueSize || defaultConfig.flushQueueSize;
    this.instanceName = options.instanceName || defaultConfig.instanceName;
    this.loggerProvider = options.loggerProvider || defaultConfig.loggerProvider;
    this.logLevel = options.logLevel ?? defaultConfig.logLevel;
    this.minIdLength = options.minIdLength;
    this.plan = options.plan;
    this.ingestionMetadata = options.ingestionMetadata;
    this.offline = options.offline !== undefined ? options.offline : defaultConfig.offline;
    this.optOut = options.optOut ?? defaultConfig.optOut;
    this.serverUrl = options.serverUrl;
    this.serverZone = options.serverZone || defaultConfig.serverZone;
    this.storageProvider = options.storageProvider;
    this.transportProvider = options.transportProvider;
    this.useBatch = options.useBatch ?? defaultConfig.useBatch;
    this.loggerProvider.enable(this.logLevel);

    const serverConfig = createServerConfig(options.serverUrl, options.serverZone, options.useBatch);
    this.serverZone = serverConfig.serverZone;
    this.serverUrl = serverConfig.serverUrl;
  }
}

export const getServerUrl = (serverZone: ServerZoneType, useBatch: boolean) => {
  if (serverZone === 'EU') {
    return useBatch ? EU_AMPLITUDE_BATCH_SERVER_URL : EU_AMPLITUDE_SERVER_URL;
  }
  return useBatch ? AMPLITUDE_BATCH_SERVER_URL : AMPLITUDE_SERVER_URL;
};

export const createServerConfig = (
  serverUrl = '',
  serverZone: ServerZoneType = getDefaultConfig().serverZone,
  useBatch: boolean = getDefaultConfig().useBatch,
) => {
  if (serverUrl) {
    return { serverUrl, serverZone: undefined };
  }
  const _serverZone = ['US', 'EU'].includes(serverZone) ? serverZone : getDefaultConfig().serverZone;
  return {
    serverZone: _serverZone,
    serverUrl: getServerUrl(_serverZone, useBatch),
  };
};

export class RequestMetadata implements IRequestMetadata {
  sdk: {
    metrics: {
      histogram: HistogramOptions;
    };
  };

  constructor() {
    this.sdk = {
      metrics: {
        histogram: {},
      },
    };
  }

  recordHistogram<T extends HistogramKey>(key: T, value: HistogramOptions[T]) {
    this.sdk.metrics.histogram[key] = value;
  }
}

class HistogramOptions implements IHistogramOptions {
  remote_config_fetch_time_IDB?: number;
  remote_config_fetch_time_API_success?: number;
  remote_config_fetch_time_API_fail?: number;
}
