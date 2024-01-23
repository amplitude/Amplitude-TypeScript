import { Event } from '../event';
import { IngestionMetadata } from '../ingestion-metadata';
import { Plan } from '../plan';
import { ServerZoneType } from '../server-zone';
import { Storage } from '../storage';
import { Transport } from '../transport';
import { Logger, LogLevel } from '../logger';
import { OfflineDisabled } from '../offline';

export interface Config {
  apiKey: string;
  flushIntervalMillis: number;
  flushMaxRetries: number;
  flushQueueSize: number;
  instanceName?: string;
  logLevel: LogLevel;
  loggerProvider: Logger;
  minIdLength?: number;
  offline?: boolean | typeof OfflineDisabled;
  optOut: boolean;
  plan?: Plan;
  ingestionMetadata?: IngestionMetadata;
  serverUrl?: string;
  serverZone?: ServerZoneType;
  storageProvider?: Storage<Event[]>;
  transportProvider: Transport;
  useBatch: boolean;
}

export interface Options extends Partial<Config> {
  apiKey: string;
  transportProvider: Transport;
}
