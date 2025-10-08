import { ServerZoneType } from './server-zone';
import { IRemoteConfigClient } from '../remote-config/remote-config';
import { ILogger } from '../logger';
import { IDiagnosticsClient } from '../diagnostics/diagnostics-client';

/**
 * @experimental
 * AmplitudeContext holds the core configuration and dependencies for an Amplitude instance.
 * This includes API key, instance name, server zone, remote config client, and logger.
 * They are all readonly and not nullable.
 */
export interface AmplitudeContext {
  readonly apiKey: string;
  readonly instanceName: string;
  readonly serverZone: ServerZoneType;
  readonly loggerProvider: ILogger;

  readonly remoteConfigClient: IRemoteConfigClient;
  readonly diagnosticsClient: IDiagnosticsClient;
}
