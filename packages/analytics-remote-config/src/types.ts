export interface SessionReplaySamplingConfig {
  sample_rate: number;
  capture_enabled: boolean;
}

export interface SessionReplayRemoteConfig {
  sr_sampling_config: SessionReplaySamplingConfig;
}

export type RemoteConfig = SessionReplayRemoteConfig;

export enum ConfigNamespace {
  SESSION_REPLAY = 'sessionReplay',
}

export interface RemoteConfigAPIResponse {
  configs: {
    [ConfigNamespace.SESSION_REPLAY]: SessionReplayRemoteConfig;
  };
}

export interface RemoteConfigFetch {
  getRemoteConfig: (configNamespace: ConfigNamespace, key: string, sessionId?: number) => Promise<RemoteConfig | void>;
}

export interface RemoteConfigIDBStore {
  storeRemoteConfig: (remoteConfig: RemoteConfigAPIResponse, sessionId?: number) => Promise<void>;
  getRemoteConfig: (configNamespace: ConfigNamespace, key: string) => Promise<RemoteConfig | void>;
  getLastFetchedSessionId: () => Promise<number | void>;
}
