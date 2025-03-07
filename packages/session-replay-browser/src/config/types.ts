import { Config, LogLevel, Logger } from '@amplitude/analytics-types';
import { StoreType, ConsoleLogLevel } from '../typings/session-replay';

export interface SamplingConfig {
  sample_rate: number;
  capture_enabled: boolean;
}

export interface InteractionConfig {
  trackEveryNms?: number;
  enabled: boolean; // defaults to false
  batch: boolean; // defaults to false
}

export interface LoggingConfig {
  console: {
    enabled: boolean;
    levels: ConsoleLogLevel[];
  };
  network: {
    enabled: boolean;
  };
}

export type SessionReplayRemoteConfig = {
  sr_sampling_config?: SamplingConfig;
  sr_privacy_config?: PrivacyConfig;
  sr_interaction_config?: InteractionConfig;
  sr_logging_config?: LoggingConfig;
};

export interface SessionReplayRemoteConfigAPIResponse {
  configs: {
    sessionReplay: SessionReplayRemoteConfig;
  };
}

export type MaskLevel =
  | 'light' // only mask a subset of inputs that’s deemed sensitive - password, credit card, telephone #, email. These are information we never want to capture.
  | 'medium' // mask all inputs
  | 'conservative'; // mask all inputs and all texts

export const DEFAULT_MASK_LEVEL = 'medium';

// err on the side of excluding more
export type PrivacyConfig = {
  blockSelector?: string | string[]; // exclude in the UI
  defaultMaskLevel?: MaskLevel;
  maskSelector?: string[];
  unmaskSelector?: string[];
};

export interface SessionReplayLocalConfig extends Config {
  apiKey: string;
  loggerProvider: Logger;
  logLevel: LogLevel;
  flushMaxRetries: number;
  sampleRate: number;
  privacyConfig?: PrivacyConfig;
  debugMode?: boolean;
  // This will control which endpoint is used for remote config.
  // This will override server zone if specified.
  configServerUrl?: string;
  // This will control which endpoint is used for session replay track calls.
  // This will override server zone if specified.
  trackServerUrl?: string;
  shouldInlineStylesheet?: boolean;
  version?: SessionReplayVersion;
  performanceConfig?: SessionReplayPerformanceConfig;
  storeType: StoreType;

  experimental?: {
    useWebWorker: boolean;
  };
}

export interface SessionReplayJoinedConfig extends SessionReplayLocalConfig {
  captureEnabled?: boolean;
  interactionConfig?: InteractionConfig;
  loggingConfig?: LoggingConfig;
}

export interface SessionReplayRemoteConfigFetch {
  getServerUrl: () => void;
  getSamplingConfig: (sessionId?: number) => Promise<SessionReplayRemoteConfig['sr_sampling_config'] | void>;
  fetchRemoteConfig: (sessionId?: number) => Promise<SessionReplayRemoteConfig | void>;
  getRemoteConfig: (sessionId?: number) => Promise<SessionReplayRemoteConfig | void>;
}

export interface SessionReplayJoinedConfigGenerator {
  generateJoinedConfig: (sessionId?: string | number) => Promise<SessionReplayJoinedConfig>;
}

export interface SessionReplayVersion {
  version: string;
  type: SessionReplayType;
}

export interface SessionReplayPerformanceConfig {
  enabled: boolean;
  timeout?: number;
}

export type SessionReplayType = 'standalone' | 'plugin' | 'segment';
