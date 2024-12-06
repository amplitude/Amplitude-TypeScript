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
  // Each metric is independent. See RemoteConfigMetric for more information.
  metrics: RemoteConfigMetric;
}

export interface RemoteConfigMetric {
  // The time, in milliseconds, taken to fetch the last remote config via getRemoteConfig() from API.
  // If multiple remote config fetches occur, this value will be updated to reflect the time of the most recent fetch.
  fetchTimeAPISuccess?: number;
  // The time, in milliseconds, taken to fetch the last remote config via getRemoteConfig() from API
  // but failed because of exceeding max retry or an error.
  // If multiple remote config fetches occur, this value will be updated to reflect the time of the most recent fetch.
  fetchTimeAPIFail?: number;
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
