import { BaseTransport } from '@amplitude/analytics-core';
import { Config, ServerZone, Status } from '@amplitude/analytics-types';
import * as RemoteConfigAPIStore from './remote-config-idb-store';
import {
  CreateRemoteConfigFetch,
  RemoteConfigFetch as IRemoteConfigFetch,
  RemoteConfigAPIResponse,
  RemoteConfigIDBStore,
} from './types';

const UNEXPECTED_NETWORK_ERROR_MESSAGE = 'Network error occurred, remote config fetch failed';
const SUCCESS_REMOTE_CONFIG = 'Remote config successfully fetched';
const MAX_RETRIES_EXCEEDED_MESSAGE = 'Remote config fetch rejected due to exceeded retry count';
const TIMEOUT_MESSAGE = 'Remote config fetch rejected due to timeout after 5 seconds';
const UNEXPECTED_ERROR_MESSAGE = 'Unexpected error occurred';

export const REMOTE_CONFIG_SERVER_URL = 'https://sr-client-cfg.amplitude.com/config';
export const REMOTE_CONFIG_SERVER_URL_STAGING = 'https://sr-client-cfg.stag2.amplitude.com/config';
export const REMOTE_CONFIG_SERVER_URL_EU = 'https://sr-client-cfg.eu.amplitude.com/config';

export class RemoteConfigFetch<RemoteConfig extends { [key: string]: object }>
  implements IRemoteConfigFetch<RemoteConfig>
{
  localConfig: Config;
  remoteConfigIDBStore: RemoteConfigIDBStore<RemoteConfig> | undefined;
  retryTimeout = 1000;
  attempts = 0;
  lastFetchedSessionId: number | undefined;
  sessionTargetingMatch = false;
  configKeys: string[];
  // Time used to fetch remote config in milliseconds
  fetchTime = 0;

  constructor({ localConfig, configKeys }: { localConfig: Config; configKeys: string[] }) {
    this.localConfig = localConfig;
    this.configKeys = configKeys;
  }

  async initialize() {
    this.remoteConfigIDBStore = await RemoteConfigAPIStore.createRemoteConfigIDBStore<RemoteConfig>({
      apiKey: this.localConfig.apiKey,
      loggerProvider: this.localConfig.loggerProvider,
      configKeys: this.configKeys,
    });
  }

  getRemoteConfig = async <K extends keyof RemoteConfig>(
    configNamespace: string,
    key: K,
    sessionId?: number,
  ): Promise<RemoteConfig[K] | undefined> => {
    const fetchStartTime = Date.now();
    // First check IndexedDB for session
    if (this.remoteConfigIDBStore) {
      const lastFetchedSessionId = await this.remoteConfigIDBStore.getLastFetchedSessionId();

      // Another option is to empty the db if current session doesn't match lastFetchedSessionId
      if (!!lastFetchedSessionId && !!sessionId && lastFetchedSessionId === sessionId) {
        const idbRemoteConfig = await this.remoteConfigIDBStore.getRemoteConfig(configNamespace, key);
        this.fetchTime = Date.now() - fetchStartTime;
        return idbRemoteConfig;
      }
    }
    // Finally fetch via API
    const configAPIResponse = await this.fetchWithTimeout(sessionId);
    if (configAPIResponse) {
      const remoteConfig = configAPIResponse.configs && configAPIResponse.configs[configNamespace];
      if (remoteConfig) {
        this.fetchTime = Date.now() - fetchStartTime;
        return remoteConfig[key];
      }
    }
    this.fetchTime = Date.now() - fetchStartTime;
    return undefined;
  };

  getServerUrl() {
    if (this.localConfig.serverZone === ServerZone.STAGING) {
      return REMOTE_CONFIG_SERVER_URL_STAGING;
    }

    if (this.localConfig.serverZone === ServerZone.EU) {
      return REMOTE_CONFIG_SERVER_URL_EU;
    }

    return REMOTE_CONFIG_SERVER_URL;
  }

  fetchWithTimeout = async (sessionId?: number): Promise<RemoteConfigAPIResponse<RemoteConfig> | void> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const remoteConfig = await this.fetchRemoteConfig(controller.signal, sessionId);
    clearTimeout(timeoutId);
    return remoteConfig;
  };

  fetchRemoteConfig = async (
    signal: AbortController['signal'],
    sessionId?: number,
  ): Promise<RemoteConfigAPIResponse<RemoteConfig> | void> => {
    if (sessionId === this.lastFetchedSessionId && this.attempts >= this.localConfig.flushMaxRetries) {
      return this.completeRequest({ err: MAX_RETRIES_EXCEEDED_MESSAGE });
    } else if (signal.aborted) {
      return this.completeRequest({ err: TIMEOUT_MESSAGE });
    } else if (sessionId !== this.lastFetchedSessionId) {
      this.lastFetchedSessionId = sessionId;
      this.attempts = 0;
    }

    try {
      const urlParams = new URLSearchParams({
        api_key: this.localConfig.apiKey,
        config_keys: this.configKeys.join(','),
      });
      const options: RequestInit = {
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
        },
        method: 'GET',
      };
      const serverUrl = `${this.getServerUrl()}?${urlParams.toString()}`;
      this.attempts += 1;
      const res = await fetch(serverUrl, { ...options, signal: signal });
      if (res === null) {
        return this.completeRequest({ err: UNEXPECTED_ERROR_MESSAGE });
      }
      const parsedStatus = new BaseTransport().buildStatus(res.status);
      switch (parsedStatus) {
        case Status.Success:
          this.attempts = 0;
          return this.parseAndStoreConfig(res, sessionId);
        case Status.Failed:
          return this.retryFetch(signal, sessionId);
        default:
          return this.completeRequest({ err: UNEXPECTED_NETWORK_ERROR_MESSAGE });
      }
    } catch (e) {
      const knownError = e as Error;
      if (signal.aborted) {
        return this.completeRequest({ err: TIMEOUT_MESSAGE });
      }
      return this.completeRequest({ err: knownError.message });
    }
  };

  retryFetch = async (
    signal: AbortController['signal'],
    sessionId?: number,
  ): Promise<RemoteConfigAPIResponse<RemoteConfig> | void> => {
    await new Promise((resolve) => setTimeout(resolve, this.attempts * this.retryTimeout));
    return this.fetchRemoteConfig(signal, sessionId);
  };

  parseAndStoreConfig = async (res: Response, sessionId?: number): Promise<RemoteConfigAPIResponse<RemoteConfig>> => {
    const remoteConfig: RemoteConfigAPIResponse<RemoteConfig> =
      (await res.json()) as RemoteConfigAPIResponse<RemoteConfig>;
    this.remoteConfigIDBStore && (await this.remoteConfigIDBStore.storeRemoteConfig(remoteConfig, sessionId));
    this.completeRequest({ success: SUCCESS_REMOTE_CONFIG });
    return remoteConfig;
  };

  completeRequest({ err, success }: { err?: string; success?: string }) {
    if (err) {
      throw new Error(err);
    } else if (success) {
      this.localConfig.loggerProvider.log(success);
    }
  }
}

export const createRemoteConfigFetch: CreateRemoteConfigFetch = async <
  RemoteConfig extends { [Property in keyof RemoteConfig]: RemoteConfig[Property] },
>({
  localConfig,
  configKeys,
}: {
  localConfig: Config;
  configKeys: string[];
}) => {
  const remoteConfigFetch = new RemoteConfigFetch<RemoteConfig>({ localConfig, configKeys });
  await remoteConfigFetch.initialize();
  return remoteConfigFetch;
};
