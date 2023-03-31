import { Event } from './event';
import { Config } from './config';
import { Result } from './result';
import { CoreClient } from './client/core-client';

export enum PluginType {
  BEFORE = 'before',
  ENRICHMENT = 'enrichment',
  DESTINATION = 'destination',
}

export interface BeforePlugin<T = CoreClient> {
  name: string;
  type: PluginType.BEFORE;
  setup(config: Config, client?: T): Promise<void>;
  execute(context: Event): Promise<Event | null>;
}

export interface EnrichmentPlugin<T = CoreClient> {
  name: string;
  type: PluginType.ENRICHMENT;
  setup(config: Config, client?: T): Promise<void>;
  execute(context: Event): Promise<Event | null>;
}

export interface DestinationPlugin<T = CoreClient> {
  name: string;
  type: PluginType.DESTINATION;
  setup(config: Config, client?: T): Promise<void>;
  execute(context: Event): Promise<Result>;
  flush?(): Promise<void>;
}

export type Plugin = BeforePlugin | EnrichmentPlugin | DestinationPlugin;
