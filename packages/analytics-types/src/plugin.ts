import { Event } from './event';
import { Config } from './config';
import { Result } from './result';
import { BaseClient } from './client/base-client';

export enum PluginType {
  BEFORE = 'before',
  ENRICHMENT = 'enrichment',
  DESTINATION = 'destination',
}

export interface BeforePlugin<T = BaseClient> {
  name: string;
  type: PluginType.BEFORE;
  setup(config: Config, client?: T): Promise<void>;
  execute(context: Event): Promise<Event>;
}

export interface EnrichmentPlugin<T = BaseClient> {
  name: string;
  type: PluginType.ENRICHMENT;
  setup(config: Config, client?: T): Promise<void>;
  execute(context: Event): Promise<Event>;
}

export interface DestinationPlugin<T = BaseClient> {
  name: string;
  type: PluginType.DESTINATION;
  setup(config: Config, client?: T): Promise<void>;
  execute(context: Event): Promise<Result>;
  flush?(): Promise<void>;
}

export type Plugin = BeforePlugin | EnrichmentPlugin | DestinationPlugin;
