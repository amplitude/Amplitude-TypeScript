import { Config } from '@amplitude/analytics-types';

export interface RemoteConfigAPIResponse<RemoteConfig extends { [key: string]: object }> {
  configs: {
    [key: string]: RemoteConfig;
  };
}

export interface RemoteConfigFetch<RemoteConfig extends { [key: string]: object }> {
  getRemoteConfig: (
    configNamespace: string,
    key: string,
    sessionId?: number,
  ) => Promise<RemoteConfig[typeof key] | void>;
}

export interface RemoteConfigIDBStore<RemoteConfig extends { [key: string]: object }> {
  storeRemoteConfig: (remoteConfig: RemoteConfigAPIResponse<RemoteConfig>, sessionId?: number) => Promise<void>;
  getRemoteConfig: (configNamespace: string, key: string) => Promise<RemoteConfig[typeof key] | void>;
  getLastFetchedSessionId: () => Promise<number | void>;
}

export type CreateRemoteConfigFetch = <RemoteConfig extends { [key: string]: object }>({
  localConfig,
  configKeys,
}: {
  localConfig: Config;
  configKeys: string[];
}) => Promise<RemoteConfigFetch<RemoteConfig>>;
