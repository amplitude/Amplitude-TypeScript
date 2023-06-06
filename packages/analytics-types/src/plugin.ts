import { Event } from './event';
import { Config } from './config';
import { Result } from './result';
import { CoreClient } from './client/core-client';

type PluginTypeBefore = 'before';
type PluginTypeEnrichment = 'enrichment';
type PluginTypeDestination = 'destination';
export type PluginType = PluginTypeBefore | PluginTypeEnrichment | PluginTypeDestination;

interface PluginBase<T = CoreClient> {
  name?: string;
  type?: PluginType;
  setup?(config: Config, client: T): Promise<void>;
}

export interface BeforePlugin extends PluginBase {
  type: PluginTypeBefore;
  execute?(context: Event): Promise<Event | null>;
}

export interface EnrichmentPlugin extends PluginBase {
  type?: PluginTypeEnrichment;
  execute?(context: Event): Promise<Event | null>;
}

export interface DestinationPlugin extends PluginBase {
  type: PluginTypeDestination;
  execute(context: Event): Promise<Result>;
  flush?(): Promise<void>;
}

export type Plugin = BeforePlugin | EnrichmentPlugin | DestinationPlugin;
