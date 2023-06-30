import { Event } from './event';
import { Config } from './config';
import { Result } from './result';
import { CoreClient } from './client/core-client';

export enum PluginType {
  BEFORE = 'before',
  ENRICHMENT = 'enrichment',
  DESTINATION = 'destination',
}

export interface BeforePlugin<T = CoreClient, U = Config> {
  name: string;
  type: PluginType.BEFORE;
  setup(config: U, client?: T): Promise<void>;
  execute(context: Event): Promise<Event | null>;
  teardown?(): Promise<void>;
}

export interface EnrichmentPlugin<T = CoreClient, U = Config> {
  name: string;
  type: PluginType.ENRICHMENT;
  setup(config: U, client?: T): Promise<void>;
  execute(context: Event): Promise<Event | null>;
  teardown?(): Promise<void>;
}

export interface DestinationPlugin<T = CoreClient, U = Config> {
  name: string;
  type: PluginType.DESTINATION;
  setup(config: U, client?: T): Promise<void>;
  execute(context: Event): Promise<Result>;
  flush?(): Promise<void>;
  teardown?(): Promise<void>;
}

export type Plugin<T = CoreClient, U = Config> = BeforePlugin<T, U> | EnrichmentPlugin<T, U> | DestinationPlugin<T, U>;
