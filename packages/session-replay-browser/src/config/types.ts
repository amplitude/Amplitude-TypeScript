import { Config, LogLevel, Logger } from '@amplitude/analytics-types';

export interface SamplingConfig {
  sample_rate: number;
  capture_enabled: boolean;
}
export interface SessionReplayRemoteConfig {
  sr_sampling_config: SamplingConfig;
}

export interface SessionReplayRemoteConfigAPIResponse {
  configs: {
    sessionReplay: SessionReplayRemoteConfig;
  };
}
export interface SessionReplayPrivacyConfig {
  blockSelector?: string | string[];
}

export interface SessionReplayLocalConfig extends Config {
  apiKey: string;
  loggerProvider: Logger;
  logLevel: LogLevel;
  flushMaxRetries: number;
  sampleRate: number;
  privacyConfig?: SessionReplayPrivacyConfig;
  debugMode?: boolean;
}

export interface SessionReplayJoinedConfig extends SessionReplayLocalConfig {
  captureEnabled?: boolean;
}

export interface SessionReplayRemoteConfigFetch {
  getSamplingConfig: (sessionId: number) => Promise<SamplingConfig | void>;
}
