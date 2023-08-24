import { Event } from './event';
import { Config } from './config';
import { Result } from './result';
import { CoreClient } from './client/core-client';

type PluginTypeBefore = 'before';
type PluginTypeEnrichment = 'enrichment';
type PluginTypeDestination = 'destination';
export type PluginType = PluginTypeBefore | PluginTypeEnrichment | PluginTypeDestination;

interface PluginBase<T = CoreClient, U = Config> {
  name?: string;
  type?: PluginType;
  setup?(config: U, client: T): Promise<void>;
  teardown?(): Promise<void>;
}

export interface BeforePlugin<T = CoreClient, U = Config> extends PluginBase<T, U> {
  type: PluginTypeBefore;
  execute?(context: Event): Promise<Event | null>;
}

export interface EnrichmentPlugin<T = CoreClient, U = Config> extends PluginBase<T, U> {
  type?: PluginTypeEnrichment;
  execute?(context: Event): Promise<Event | null>;
}

export interface DestinationPlugin<T = CoreClient, U = Config> extends PluginBase<T, U> {
  type: PluginTypeDestination;
  execute(context: Event): Promise<Result>;
  flush?(): Promise<void>;
}

export interface DiagnosticPlugin<T = CoreClient, U = Config> extends DestinationPlugin<T, U> {
  track(eventCount: number, code: number, message: string): Promise<void>;
}

export type Plugin<T = CoreClient, U = Config> =
  | BeforePlugin<T, U>
  | EnrichmentPlugin<T, U>
  | DestinationPlugin<T, U>
  | DiagnosticPlugin<T, U>;
