import { Config } from '@amplitude/analytics-types';

export interface RemoteConfigAPIResponse<RemoteConfig extends { [key: string]: object }> {
  configs: {
    [key: string]: RemoteConfig;
  };
}

export interface BaseRemoteConfigFetch<T> {
  getRemoteConfig: <K extends keyof T>(
    configNamespace: string,
    key: K,
    sessionId?: number,
  ) => Promise<T[K] | undefined>;
}

export interface RemoteConfigFetch<T> extends BaseRemoteConfigFetch<T> {
  metrics: Map<string, string | number>;
}

export enum RemoteConfigMetric {
  // The time, in milliseconds, taken to fetch the last remote config via getRemoteConfig() from IndexedDB.
  // If multiple remote config fetches occur, this value will be updated to reflect the time of the most recent fetch.
  FetchTimeIDB = 'remote_config_fetch_time_IDB',
  // The time, in milliseconds, taken to fetch the last remote config via getRemoteConfig() from API.
  // If multiple remote config fetches occur, this value will be updated to reflect the time of the most recent fetch.
  FetchTimeAPI = 'remote_config_fetch_time_API',
}

export interface RemoteConfigIDBStore<RemoteConfig extends { [key: string]: object }>
  extends BaseRemoteConfigFetch<RemoteConfig> {
  storeRemoteConfig: (remoteConfig: RemoteConfigAPIResponse<RemoteConfig>, sessionId?: number) => Promise<void>;
  getLastFetchedSessionId: () => Promise<number | void>;
  remoteConfigHasValues: (configNamespace: string) => Promise<boolean>;
}

export type CreateRemoteConfigFetch = <RemoteConfig extends { [key: string]: object }>({
  localConfig,
  configKeys,
}: {
  localConfig: Config;
  configKeys: string[];
}) => Promise<RemoteConfigFetch<RemoteConfig>>;
