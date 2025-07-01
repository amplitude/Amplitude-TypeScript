import { Config, Logger, FetchTransport, LogLevel } from '@amplitude/analytics-core';
import { DEFAULT_PERFORMANCE_CONFIG, DEFAULT_SAMPLE_RATE, DEFAULT_SERVER_ZONE } from '../constants';
import { SessionReplayOptions, StoreType } from '../typings/session-replay';
import {
  SessionReplayLocalConfig as ISessionReplayLocalConfig,
  InteractionConfig,
  PrivacyConfig,
  SessionReplayPerformanceConfig,
  SessionReplayVersion,
} from './types';
import { SafeLoggerProvider } from '../logger';
import { validateUGCFilterRules } from '../helpers';

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
  experimental?: { useWebWorker: boolean };
  applyBackgroundColorToBlockedElements?: boolean;

  constructor(apiKey: string, options: SessionReplayOptions) {
    const defaultConfig = getDefaultConfig();
    super({
      transportProvider: defaultConfig.transportProvider,
      loggerProvider: new SafeLoggerProvider(options.loggerProvider || defaultConfig.loggerProvider),
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
    this.performanceConfig = options.performanceConfig || DEFAULT_PERFORMANCE_CONFIG;
    this.storeType = options.storeType ?? 'idb';
    this.applyBackgroundColorToBlockedElements = options.applyBackgroundColorToBlockedElements ?? false;

    if (options.privacyConfig) {
      this.privacyConfig = options.privacyConfig;
    }
    if (options.interactionConfig) {
      this.interactionConfig = options.interactionConfig;

      // validate ugcFilterRules, throw error if invalid - throw error at the beginning of the config
      if (this.interactionConfig.ugcFilterRules) {
        validateUGCFilterRules(this.interactionConfig.ugcFilterRules);
      }
    }
    if (options.debugMode) {
      this.debugMode = options.debugMode;
    }
    if (options.experimental) {
      this.experimental = options.experimental;
    }
  }
}
