import { Config, LogLevel, Logger } from '@amplitude/analytics-types';

export interface SamplingConfig {
  sample_rate: number;
  capture_enabled: boolean;
}

/**
 * NOTE(lew): defining the type like this so that it's easy to convert to
 * the local config. This won't handle deep copies (probably), so it may
 * need to be updated in the future.
 */
export type PrivacyConfig = {
  [k in keyof SessionReplayPrivacyConfig]: SessionReplayPrivacyConfig[k];
};

export type SessionReplayRemoteConfig = {
  sr_sampling_config?: SamplingConfig;
  sr_privacy_config?: PrivacyConfig;
};

export interface SessionReplayRemoteConfigAPIResponse {
  configs: {
    sessionReplay: SessionReplayRemoteConfig;
  };
}

export type SessionReplayPrivacyConfig = {
  blockSelector?: string | string[];
};

export interface SessionReplayLocalConfig extends Config {
  apiKey: string;
  loggerProvider: Logger;
  logLevel: LogLevel;
  flushMaxRetries: number;
  sampleRate: number;
  privacyConfig?: SessionReplayPrivacyConfig;
  debugMode?: boolean;
  configEndpointUrl?: string;
}

export interface SessionReplayJoinedConfig extends SessionReplayLocalConfig {
  captureEnabled?: boolean;
}

export interface SessionReplayRemoteConfigFetch {
  getServerUrl: () => void;
  getSamplingConfig: (sessionId?: number) => Promise<SessionReplayRemoteConfig['sr_sampling_config'] | void>;
  fetchRemoteConfig: (sessionId?: number) => Promise<SessionReplayRemoteConfig | void>;
  getRemoteConfig: (sessionId?: number) => Promise<SessionReplayRemoteConfig | void>;
}

export interface SessionReplayJoinedConfigGenerator {
  generateJoinedConfig: (sessionId?: number) => Promise<SessionReplayJoinedConfig>;
}
