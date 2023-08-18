import { FetchTransport } from '@amplitude/analytics-client-common';
import { Config, Logger } from '@amplitude/analytics-core';
import { LogLevel } from '@amplitude/analytics-types';
import { SessionReplayConfig as ISessionReplayConfig, SessionReplayOptions } from './typings/session-replay';

export const getDefaultConfig = () => ({
  logLevel: LogLevel.Warn,
  loggerProvider: new Logger(),
  transportProvider: new FetchTransport(),
});

export class SessionReplayConfig extends Config implements ISessionReplayConfig {
  apiKey: string;
  sampleRate: number;

  // NOTE: These protected properties are used to cache values from async storage
  protected _deviceId?: string;
  protected _sessionId?: number;

  constructor(apiKey: string, options: SessionReplayOptions) {
    const defaultConfig = getDefaultConfig();
    super({
      transportProvider: defaultConfig.transportProvider,
      ...options,
      apiKey,
    });

    this.apiKey = apiKey;
    this.sampleRate = options.sampleRate || 1;

    this.deviceId = options.deviceId;
    this.sessionId = options.sessionId;
  }

  get deviceId() {
    return this._deviceId;
  }

  set deviceId(deviceId: string | undefined) {
    if (this._deviceId !== deviceId) {
      this._deviceId = deviceId;
    }
  }

  get sessionId() {
    return this._sessionId;
  }

  set sessionId(sessionId: number | undefined) {
    if (this._sessionId !== sessionId) {
      this._sessionId = sessionId;
    }
  }
}
