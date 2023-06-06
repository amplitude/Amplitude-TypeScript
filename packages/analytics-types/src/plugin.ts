import { Event } from './event';
import { Config } from './config';
import { Result } from './result';
import { CoreClient } from './client/core-client';

type BeforePluginType = 'before';
type EnrichmentPluginType = 'enrichment';
type DestinationPluginType = 'destination';
export type PluginType = BeforePluginType | EnrichmentPluginType | DestinationPluginType;

interface PluginBase<T = CoreClient> {
  name?: string;
  type?: PluginType;
  setup?(config: Config, client: T): Promise<void>;
}

export interface BeforePlugin extends PluginBase {
  type: BeforePluginType;
  execute?(context: Event): Promise<Event | null>;
}

export interface EnrichmentPlugin extends PluginBase {
  type?: EnrichmentPluginType;
  execute?(context: Event): Promise<Event | null>;
}

export interface DestinationPlugin extends PluginBase {
  type: DestinationPluginType;
  execute(context: Event): Promise<Result>;
  flush?(): Promise<void>;
}

export type Plugin = BeforePlugin | EnrichmentPlugin | DestinationPlugin;
