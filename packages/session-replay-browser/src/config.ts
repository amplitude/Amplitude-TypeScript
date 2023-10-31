import { FetchTransport } from '@amplitude/analytics-client-common';
import { Config, Logger } from '@amplitude/analytics-core';
import { LogLevel } from '@amplitude/analytics-types';
import { SessionReplayConfig as ISessionReplayConfig, SessionReplayOptions } from './typings/session-replay';
import { DEFAULT_SAMPLE_RATE } from './constants';
import { generateSessionReplayId } from './helpers';

export const getDefaultConfig = () => ({
  flushMaxRetries: 2,
  logLevel: LogLevel.Warn,
  loggerProvider: new Logger(),
  transportProvider: new FetchTransport(),
});

export class SessionReplayConfig extends Config implements ISessionReplayConfig {
  apiKey: string;
  sampleRate: number;
  deviceId?: string | undefined;
  sessionId?: number | undefined;
  sessionReplayId?: string | undefined | null;

  constructor(apiKey: string, options: SessionReplayOptions) {
    const defaultConfig = getDefaultConfig();
    super({
      transportProvider: defaultConfig.transportProvider,
      ...options,
      apiKey,
    });
    this.flushMaxRetries =
      options.flushMaxRetries !== undefined && options.flushMaxRetries <= defaultConfig.flushMaxRetries
        ? options.flushMaxRetries
        : defaultConfig.flushMaxRetries;

    this.apiKey = apiKey;
    this.sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;

    if (options.sessionReplayId) {
      this.sessionReplayId = options.sessionReplayId;
    } else if (options.sessionId && options.deviceId) {
      this.deviceId = options.deviceId;
      this.sessionId = options.sessionId;
      this.sessionReplayId = generateSessionReplayId(options.sessionId, options.deviceId);
    }
  }
}
