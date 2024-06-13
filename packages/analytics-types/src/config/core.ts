import { Event } from '../event';
import { IngestionMetadata } from '../ingestion-metadata';
import { Plan } from '../plan';
import { ServerZoneType } from '../server-zone';
import { Storage } from '../storage';
import { Transport } from '../transport';
import { Logger, LogLevel } from '../logger';
import { OfflineDisabled } from '../offline';

export interface Config {
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
  loggerProvider: Logger;
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
}

export interface Options extends Partial<Config> {
  apiKey: string;
  transportProvider: Transport;
}
