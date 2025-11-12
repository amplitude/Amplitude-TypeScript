import { Event } from './event/event';
import { IConfig } from './config/core-config';
import { Result } from './result';
import { CoreClient } from './client/core-client';

type PluginTypeBefore = 'before';
type PluginTypeEnrichment = 'enrichment';
type PluginTypeDestination = 'destination';
export type PluginType = PluginTypeBefore | PluginTypeEnrichment | PluginTypeDestination;

export interface AnalyticsIdentity {
  deviceId?: string;
  userId?: string;
  userProperties?: { [key: string]: any };
}

interface PluginBase<T = CoreClient, U = IConfig> {
  name?: string;
  type?: PluginType;
  setup?(config: U, client: T): Promise<void>;
  teardown?(): Promise<void>;
  /**
   * Called when the identity is changed. This is a **best-effort** API and may not be triggered in all scenarios.
   *
   * Currently supported only in the Browser SDK. Not supported in React Native or Node SDKs.
   *
   * @param identity The changed identity. If a field is missing, it means it has not changed.
   * For example, `{ userId: undefined }` means the userId was explicitly changed to `undefined`,
   * while deviceId and userProperties remain unchanged.
   *
   * Note: `onIdentityChanged()` will be triggered when a user logs in via `setUserId()`.
   * It will not be triggered on subsequent page loads (e.g., when a user reopens the site in a new tab).
   */
  onIdentityChanged?(identity: AnalyticsIdentity): Promise<void>;
  onSessionIdChanged?(sessionId: number): Promise<void>;
  onOptOutChanged?(optOut: boolean): Promise<void>;
  /**
   * Called when reset() is invoked on the client.
   *
   * Currently supported only in the Browser SDK. Not supported in React Native or Node SDKs.
   */
  onReset?(): Promise<void>;
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
