import { Event } from '../event';
import { IngestionMetadata } from '../ingestion-metadata';
import { Plan } from '../plan';
import { ServerZoneType } from '../server-zone';
import { Storage } from '../storage';
import { Transport } from '../transport';
import { Logger, LogLevel } from '../logger';

export interface Config {
  apiKey: string;
  flushIntervalMillis: number;
  flushMaxRetries: number;
  flushQueueSize: number;
  logLevel: LogLevel;
  loggerProvider: Logger;
  minIdLength?: number;
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
