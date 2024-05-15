import { Config, LogLevel, Logger } from '@amplitude/analytics-types';

export type SessionReplayRemoteConfig = {
  sr_sampling_config: {
    sample_rate: number;
    capture_enabled: boolean;
  };
};

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
  getServerUrl: () => void;
  getSamplingConfig: (sessionId?: number) => Promise<SessionReplayRemoteConfig['sr_sampling_config'] | void>;
  fetchRemoteConfig: (sessionId?: number) => Promise<SessionReplayRemoteConfig | void>;
  getRemoteConfig: (sessionId?: number) => Promise<SessionReplayRemoteConfig | void>;
}

export interface SessionReplayJoinedConfigGenerator {
  generateJoinedConfig: (sessionId?: number) => Promise<SessionReplayJoinedConfig>;
}
