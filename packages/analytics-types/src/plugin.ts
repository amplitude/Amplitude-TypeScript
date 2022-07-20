import { Event } from './event';
import { Config } from './config';
import { Result } from './result';

export enum PluginType {
  BEFORE = 'before',
  ENRICHMENT = 'enrichment',
  DESTINATION = 'destination',
}

export interface BeforePlugin {
  name: string;
  type: PluginType.BEFORE;
  setup(config: Config): Promise<undefined>;
  execute(context: Event): Promise<Event>;
}

export interface EnrichmentPlugin {
  name: string;
  type: PluginType.ENRICHMENT;
  setup(config: Config): Promise<undefined>;
  execute(context: Event): Promise<Event>;
}

export interface DestinationPlugin {
  name: string;
  type: PluginType.DESTINATION;
  setup(config: Config): Promise<undefined>;
  execute(context: Event): Promise<Result>;
  flush?(useRetry?: boolean): Promise<void>;
}

export type Plugin = BeforePlugin | EnrichmentPlugin | DestinationPlugin;
