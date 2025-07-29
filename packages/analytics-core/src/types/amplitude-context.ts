import { ServerZoneType } from './server-zone';
import { RemoteConfigClient } from '../remote-config/remote-config';
import { ILogger, Logger } from '../logger';
import { LogLevel } from './loglevel';
import { DEFAULT_INSTANCE_NAME } from './constants';

/**
 * @experimental
 * AmplitudeContext holds the core configuration and dependencies for an Amplitude instance.
 * This includes API key, instance name, server zone, remote config client, and logger.
 */
export class AmplitudeContext {
  public readonly apiKey: string;
  public readonly instanceName: string;
  public readonly serverZone: ServerZoneType;
  public readonly remoteConfigClient: RemoteConfigClient;
  public readonly logger: ILogger;

  constructor(
    apiKey: string,
    instanceName: string = DEFAULT_INSTANCE_NAME,
    serverZone: ServerZoneType = 'US',
    logger?: ILogger,
  ) {
    this.apiKey = apiKey;
    this.instanceName = instanceName;
    this.serverZone = serverZone;

    if (!logger) {
      const defaultLogger = new Logger();
      defaultLogger.enable(LogLevel.Error);
      this.logger = defaultLogger;
    } else {
      this.logger = logger;
    }

    this.remoteConfigClient = new RemoteConfigClient(this.apiKey, this.logger, this.serverZone);
  }

  // TODO: Diagnostics, etc...
}
