import { FetchTransport } from '@amplitude/analytics-client-common';
import { Config, Logger } from '@amplitude/analytics-core';
import { LogLevel } from '@amplitude/analytics-types';
import { DEFAULT_SAMPLE_RATE, DEFAULT_SERVER_ZONE } from '../constants';
import { SessionReplayOptions, StoreType } from '../typings/session-replay';
import {
  SessionReplayLocalConfig as ISessionReplayLocalConfig,
  InteractionConfig,
  PrivacyConfig,
  SessionReplayPerformanceConfig,
  SessionReplayVersion,
} from './types';

export const getDefaultConfig = () => ({
  flushMaxRetries: 2,
  logLevel: LogLevel.Warn,
  loggerProvider: new Logger(),
  transportProvider: new FetchTransport(),
});

export class SessionReplayLocalConfig extends Config implements ISessionReplayLocalConfig {
  apiKey: string;
  sampleRate: number;
  privacyConfig?: PrivacyConfig;
  interactionConfig?: InteractionConfig;
  debugMode?: boolean;
  configServerUrl?: string;
  trackServerUrl?: string;
  shouldInlineStylesheet?: boolean;
  version?: SessionReplayVersion;
  storeType: StoreType;
  performanceConfig?: SessionReplayPerformanceConfig;

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
    this.configServerUrl = options.configServerUrl;
    this.trackServerUrl = options.trackServerUrl;
    this.shouldInlineStylesheet = options.shouldInlineStylesheet;
    this.version = options.version;
    this.performanceConfig = options.performanceConfig;
    this.storeType = options.storeType ?? 'idb';

    if (options.privacyConfig) {
      this.privacyConfig = options.privacyConfig;
    }
    if (options.debugMode) {
      this.debugMode = options.debugMode;
    }
  }
}
