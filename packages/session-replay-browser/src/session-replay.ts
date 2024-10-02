import { Logger, returnWrapper } from '@amplitude/analytics-core';
import { Logger as ILogger, LogLevel } from '@amplitude/analytics-types';
import { record } from '@amplitude/rrweb';
import { SessionReplayCapture } from './capture';
import { CustomRRwebEvent, DEFAULT_SESSION_REPLAY_PROPERTY } from './constants';
import { generateSessionReplayId } from './helpers';
import { SessionIdentifiers } from './identifiers';
import {
  AmplitudeSessionReplay,
  SessionIdentifiers as ISessionIdentifiers,
  SessionReplayOptions,
} from './typings/session-replay';

export class SessionReplay implements AmplitudeSessionReplay {
  name = '@amplitude/session-replay-browser';
  identifiers: ISessionIdentifiers | undefined;
  options: SessionReplayOptions | undefined;
  apiKey: string | undefined;
  captureClients: Record<string, SessionReplayCapture> = {};
  loggerProvider: ILogger;
  recordCancelCallback: ReturnType<typeof record> | null = null;

  constructor() {
    this.loggerProvider = new Logger();
  }

  init(apiKey: string, options: SessionReplayOptions) {
    return returnWrapper(this._init(apiKey, options));
  }

  protected async _init(apiKey: string, options: SessionReplayOptions) {
    this.loggerProvider = options.loggerProvider ?? new Logger();
    Object.prototype.hasOwnProperty.call(options, 'logLevel') &&
      this.loggerProvider.enable(options.logLevel as LogLevel);

    const { sessionId, deviceId } = options;
    if (!sessionId || !deviceId) {
      return;
    }

    for (const [replayId, client] of Object.entries(this.captureClients)) {
      if (generateSessionReplayId(sessionId, deviceId) === replayId) {
        continue;
      }
      await this.teardownClient(replayId, client);
    }

    this.identifiers = new SessionIdentifiers({ sessionId, deviceId });
    this.apiKey = apiKey;
    this.options = options;

    await this.initClient(apiKey, sessionId, deviceId, options);
  }

  /**
   * Really this is a get or init client.
   */
  private async initClient(
    apiKey: string,
    sessionId: number,
    deviceId: string,
    options: SessionReplayOptions,
  ): Promise<SessionReplayCapture> {
    let client = this.getClient(sessionId, deviceId);
    if (!client) {
      client = await SessionReplayCapture.init(apiKey, sessionId, deviceId, options);
      this.putClient(client, sessionId, deviceId);
    }

    this.loggerProvider.log('starting client', JSON.stringify({ sessionId, deviceId }));

    client.start();
    return client;
  }

  private async teardownClient(replayId: string, client: SessionReplayCapture): Promise<void> {
    this.loggerProvider.log(`tearing down client ${replayId}`);

    client.listen(false);
    client.stop();
    await client.flush();
    delete this.captureClients[replayId];
  }

  putClient(client: SessionReplayCapture, sessionId: number, deviceId: string): void {
    this.captureClients[generateSessionReplayId(sessionId, deviceId)] = client;
  }

  getClient(sessionId: number, deviceId: string): SessionReplayCapture | undefined {
    return this.captureClients[generateSessionReplayId(sessionId, deviceId)];
  }

  getSessionId(): number | undefined {
    return this.identifiers?.sessionId;
  }

  setSessionId(sessionId: number, deviceId?: string) {
    return returnWrapper(this.asyncSetSessionId(sessionId, deviceId));
  }

  async asyncSetSessionId(sessionId: number, newDeviceId?: string) {
    if (this.identifiers) {
      const previousClient = this.getClient(this.identifiers.sessionId, this.identifiers.deviceId);
      if (previousClient) {
        this.loggerProvider.log(`stopping old client for replay id ${this.identifiers.sessionReplayId}`);
        await this.teardownClient(this.identifiers.sessionReplayId, previousClient);
      }
    }
    const deviceId = newDeviceId ?? this.identifiers?.deviceId;
    if (!deviceId) {
      this.loggerProvider.error(
        'device id required when setting new session id, either provide one or make sure init is called.',
      );
      return;
    }

    this.identifiers = new SessionIdentifiers({
      sessionId,
      deviceId,
    });

    if (this.apiKey && this.options) {
      const client = await this.initClient(this.apiKey, sessionId, deviceId, this.options);
      client.start();
    } else {
      this.loggerProvider.warn('not starting capture client, because `init` was not called');
    }
  }

  getSessionReplayProperties(): { [key: string]: boolean | string | null } {
    if (!this.identifiers) {
      this.loggerProvider.warn('Session replay init has not been called, cannot get session replay properties.');
      return {};
    }
    const { sessionId, deviceId } = this.identifiers;

    const client = this.getClient(sessionId, deviceId);
    if (!client) {
      this.loggerProvider.debug('Capturing not configured yet or shutdown, cannot get session replay properties.');
      return {};
    }

    const shouldRecord = client.canCapture();
    let eventProperties: { [key: string]: string | null } = {};
    if (shouldRecord) {
      eventProperties = {
        [DEFAULT_SESSION_REPLAY_PROPERTY]: this.identifiers.sessionReplayId,
      };
    }

    void client.debug(CustomRRwebEvent.GET_SR_PROPS, {
      shouldRecord,
      eventProperties: eventProperties,
    });
    return eventProperties;
  }

  async flush(useRetry = false) {
    await Promise.all(
      Object.values(this.captureClients).map((captureClient) => {
        return captureClient.flush(useRetry);
      }),
    );
  }

  shutdown() {
    for (const [replayId, client] of Object.entries(this.captureClients)) {
      void this.teardownClient(replayId, client);
    }
  }
}
