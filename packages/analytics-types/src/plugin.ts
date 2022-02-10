import { Event } from './event';

export enum PluginType {
  BEFORE = 'before',
  ENRICHMENT = 'enrichment',
  DESTINATION = 'destination',
}

export interface BeforePlugin {
  name: string;
  type: PluginType.BEFORE;
  setup(): Promise<undefined>;
  execute(event: Event): Promise<Event>;
}

export interface EnrichmentPlugin {
  name: string;
  type: PluginType.ENRICHMENT;
  setup(): Promise<undefined>;
  execute(event: Event): Promise<Event>;
}

export interface DestinationPlugin {
  name: string;
  type: PluginType.DESTINATION;
  setup(): Promise<undefined>;
  execute(event: Event): Promise<undefined>;
}

export type Plugin = BeforePlugin | EnrichmentPlugin | DestinationPlugin;
