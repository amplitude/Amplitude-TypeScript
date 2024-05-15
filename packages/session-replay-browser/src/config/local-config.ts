import { FetchTransport } from '@amplitude/analytics-client-common';
import { Config, Logger } from '@amplitude/analytics-core';
import { LogLevel } from '@amplitude/analytics-types';
import { DEFAULT_SAMPLE_RATE, DEFAULT_SERVER_ZONE } from '../constants';
import { SessionReplayOptions } from '../typings/session-replay';
import { SessionReplayLocalConfig as ISessionReplayLocalConfig, SessionReplayPrivacyConfig } from './types';

export const getDefaultConfig = () => ({
  flushMaxRetries: 2,
  logLevel: LogLevel.Warn,
  loggerProvider: new Logger(),
  transportProvider: new FetchTransport(),
});

export class SessionReplayLocalConfig extends Config implements ISessionReplayLocalConfig {
  apiKey: string;
  sampleRate: number;
  privacyConfig?: SessionReplayPrivacyConfig;
  debugMode?: boolean;
  configEndpointUrl?: string;

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
    this.serverZone = options.serverZone || DEFAULT_SERVER_ZONE;
    this.configEndpointUrl = options.configEndpointUrl;

    if (options.privacyConfig) {
      this.privacyConfig = options.privacyConfig;
    }
    if (options.debugMode) {
      this.debugMode = options.debugMode;
    }
  }
}
