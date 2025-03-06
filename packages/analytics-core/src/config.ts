import { Storage, Transport, IngestionMetadata, ServerZoneType, OfflineDisabled } from '@amplitude/analytics-types';
import { Event } from './event/event';
import { Plan } from './event/plan';
import {
  AMPLITUDE_SERVER_URL,
  AMPLITUDE_BATCH_SERVER_URL,
  EU_AMPLITUDE_SERVER_URL,
  EU_AMPLITUDE_BATCH_SERVER_URL,
} from './constants';

import { Logger, ILogger, LogLevel } from './logger';

export const getDefaultConfig = () => ({
  flushMaxRetries: 12,
  flushQueueSize: 200,
  flushIntervalMillis: 10000,
  instanceName: '$default_instance',
  logLevel: LogLevel.Warn,
  loggerProvider: new Logger(),
  offline: false,
  optOut: false,
  serverUrl: AMPLITUDE_SERVER_URL,
  serverZone: 'US' as ServerZoneType,
  useBatch: false,
});

export interface IConfig {
  /**
   * Your Amplitude Project API key.
   */
  apiKey: string;
  /**
   * The interval of uploading events to Amplitude in milliseconds.
   */
  flushIntervalMillis: number;
  /**
   * The maximum number of retries for failed upload attempts. This is only applicable to retryable errors.
   */
  flushMaxRetries: number;
  /**
   * The maximum number of events that are batched in a single upload attempt.
   */
  flushQueueSize: number;
  /**
   * The instance name. For tracking events to multiple Amplitude projects in your application.
   */
  instanceName?: string;
  /**
   * Level of logs to be printed in the developer console.
   * Valid values are `LogLevel.None`, `LogLevel.Error`, `LogLevel.Warn`, `LogLevel.Verbose`,  `LogLevel.Debug`
   */
  logLevel: LogLevel;
  /**
   * A custom Logger class to emit log messages to desired destination.
   */
  loggerProvider: ILogger;
  /**
   * The minimum length for the value of userId and deviceId properties.
   */
  minIdLength?: number;
  /**
   * Whether the SDK is connected to network.
   */
  offline?: boolean | typeof OfflineDisabled;
  /**
   *  The flag to opt this device out of Amplitude tracking.
   *  If this flag is set, no additional information will be stored for the user.
   */
  optOut: boolean;
  /**
   * Tracking plan properties.
   * Amplitude internal use.
   */
  plan?: Plan;
  /**
   * Ingestion metadata.
   * Amplitude internal use.
   */
  ingestionMetadata?: IngestionMetadata;
  /**
   * The URL where events are upload to.
   */
  serverUrl?: string;
  /**
   * The Amplitude server zone.
   * Set this to EU for Amplitude projects created in EU data center.
   */
  serverZone?: ServerZoneType;
  /**
   *  The storage provider to persist unsent events.
   */
  storageProvider?: Storage<Event[]>;
  /**
   * A customer Transport Class for sending data to a server.
   */
  transportProvider: Transport;
  /**
   * The flag of whether to upload events to Batch API instead of the default HTTP V2 API.
   */
  useBatch: boolean;
  /**
   * Metrics of the SDK.
   */
  requestMetadata?: IRequestMetadata;
}

export interface IRequestMetadata {
  sdk: {
    metrics: {
      histogram: IHistogramOptions;
    };
  };

  recordHistogram<T extends HistogramKey>(key: T, value: IHistogramOptions[T]): void;
}

export interface IHistogramOptions {
  remote_config_fetch_time_IDB?: number;
  remote_config_fetch_time_API_success?: number;
  remote_config_fetch_time_API_fail?: number;
}

export type HistogramKey = keyof IHistogramOptions;

export interface ConfigOptions extends Partial<IConfig> {
  apiKey: string;
  transportProvider: Transport;
}

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
