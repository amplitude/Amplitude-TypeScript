import { Event } from '../event/event';
import { IConfig } from '../config';
import { Result } from '../types/result';
import { CoreClient } from '../core-client';

type PluginTypeBefore = 'before';
type PluginTypeEnrichment = 'enrichment';
type PluginTypeDestination = 'destination';
export type PluginType = PluginTypeBefore | PluginTypeEnrichment | PluginTypeDestination;

interface PluginBase<T = CoreClient, U = IConfig> {
  name?: string;
  type?: PluginType;
  setup?(config: U, client: T): Promise<void>;
  teardown?(): Promise<void>;
}

export interface BeforePlugin<T = CoreClient, U = IConfig> extends PluginBase<T, U> {
  type: PluginTypeBefore;
  execute?(context: Event): Promise<Event | null>;
}

export interface EnrichmentPlugin<T = CoreClient, U = IConfig> extends PluginBase<T, U> {
  type?: PluginTypeEnrichment;
  execute?(context: Event): Promise<Event | null>;
}

export interface DestinationPlugin<T = CoreClient, U = IConfig> extends PluginBase<T, U> {
  type: PluginTypeDestination;
  execute(context: Event): Promise<Result>;
  flush?(): Promise<void>;
}

export type Plugin<T = CoreClient, U = IConfig> = BeforePlugin<T, U> | EnrichmentPlugin<T, U> | DestinationPlugin<T, U>;
