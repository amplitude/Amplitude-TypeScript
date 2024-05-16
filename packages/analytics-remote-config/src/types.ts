import { Config } from '@amplitude/analytics-types';

export interface RemoteConfigAPIResponse<RemoteConfig extends { [key: string]: object }> {
  configs: {
    [key: string]: RemoteConfig;
  };
}

export interface RemoteConfigFetch<T> {
  getRemoteConfig: <K extends keyof T>(
    configNamespace: string,
    key: K,
    sessionId?: number,
  ) => Promise<T[K] | undefined>;
}

export interface RemoteConfigIDBStore<RemoteConfig extends { [key: string]: object }>
  extends RemoteConfigFetch<RemoteConfig> {
  storeRemoteConfig: (remoteConfig: RemoteConfigAPIResponse<RemoteConfig>, sessionId?: number) => Promise<void>;
  getLastFetchedSessionId: () => Promise<number | void>;
}

export type CreateRemoteConfigFetch = <RemoteConfig extends { [key: string]: object }>({
  localConfig,
  configKeys,
}: {
  localConfig: Config;
  configKeys: string[];
}) => Promise<RemoteConfigFetch<RemoteConfig>>;
