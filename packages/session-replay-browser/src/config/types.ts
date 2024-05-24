import { Config, LogLevel, Logger } from '@amplitude/analytics-types';

export interface SamplingConfig {
  sample_rate: number;
  capture_enabled: boolean;
}

export type SessionReplayRemoteConfig = {
  sr_sampling_config?: SamplingConfig;
  sr_privacy_config?: PrivacyConfig;
};

export interface SessionReplayRemoteConfigAPIResponse {
  configs: {
    sessionReplay: SessionReplayRemoteConfig;
  };
}

export enum MaskLevel {
  LIGHT, // only mask a subset of inputs that’s deemed sensitive - password, credit card, telephone #, email. These are information we never want to capture.
  MEDIUM, // mask all inputs
  CONSERVATIVE, // mask all inputs and all texts
}

export const DEFAULT_MASK_LEVEL = MaskLevel.MEDIUM;

// err on the side of excluding more
export type PrivacyConfig = {
  blockSelector?: string | string[]; // exclude in the UI
  defaultMaskLevel?: MaskLevel;
  maskSelector?: string[];
  includeSelector?: string[];
};

export interface SessionReplayLocalConfig extends Config {
  apiKey: string;
  loggerProvider: Logger;
  logLevel: LogLevel;
  flushMaxRetries: number;
  sampleRate: number;
  privacyConfig?: PrivacyConfig;
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
