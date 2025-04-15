import { Event } from './event/event';
import { IConfig } from '../config';
import { Result } from './result';
import { CoreClient } from '../core-client';

type PluginTypeBefore = 'before';
type PluginTypeEnrichment = 'enrichment';
type PluginTypeDestination = 'destination';
export type PluginType = PluginTypeBefore | PluginTypeEnrichment | PluginTypeDestination;

export interface AnalyticsIdentity {
  deviceId?: string;
  userId?: string;
  // TODO(xinyi): this is not supported right now
  userProperties?: { [key: string]: any };
}

interface PluginBase<T = CoreClient, U = IConfig> {
  name?: string;
  type?: PluginType;
  setup?(config: U, client: T): Promise<void>;
  teardown?(): Promise<void>;
  /**
   * The function is called when identity is changed.
   * Only available on Browser SDK.
   * React Native and Node SDK don't support it now.
   * @param identity Changed identity.
   * If a filed doesn't exist, it means it's not changed.
   * For example, {userId: undefined} means userId is changed to undefined
   * and deviceId and userProperties are unchanged
   */
  onIdentityChanged?(identity: AnalyticsIdentity): Promise<void>;
  onSessionIdChanged?(sessionId: number): Promise<void>;
  onOptOutChanged?(optOut: boolean): Promise<void>;
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
