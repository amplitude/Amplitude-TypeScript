import { FetchTransport } from '@amplitude/analytics-client-common';
import { Config, Logger } from '@amplitude/analytics-core';
import { LogLevel } from '@amplitude/analytics-types';
import { SessionReplayConfig as ISessionReplayConfig, SessionReplayOptions } from './typings/session-replay';

export const getDefaultConfig = () => ({
  flushMaxRetries: 5,
  logLevel: LogLevel.Warn,
  loggerProvider: new Logger(),
  transportProvider: new FetchTransport(),
});

export class SessionReplayConfig extends Config implements ISessionReplayConfig {
  apiKey: string;
  sampleRate: number;
  deviceId?: string | undefined;
  sessionId?: number | undefined;

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
}
