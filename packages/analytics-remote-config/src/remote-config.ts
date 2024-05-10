import { BaseTransport } from '@amplitude/analytics-core';
import { Config, ServerZone, Status } from '@amplitude/analytics-types';
import * as RemoteConfigAPIStore from './remote-config-idb-store';
import {
  ConfigNamespace,
  RemoteConfigFetch as IRemoteConfigFetch,
  RemoteConfig,
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

export class RemoteConfigFetch implements IRemoteConfigFetch {
  localConfig: Config;
  remoteConfigIDBStore: RemoteConfigIDBStore | undefined;
  retryTimeout = 1000;
  attempts = 0;
  lastFetchedSessionId: number | undefined;
  sessionTargetingMatch = false;
  configKeys: ConfigNamespace[];

  constructor({ localConfig, configKeys }: { localConfig: Config; configKeys: ConfigNamespace[] }) {
    this.localConfig = localConfig;
    this.configKeys = configKeys;
  }

  async initialize() {
    this.remoteConfigIDBStore = await RemoteConfigAPIStore.createRemoteConfigIDBStore({
      apiKey: this.localConfig.apiKey,
      loggerProvider: this.localConfig.loggerProvider,
    });
  }

  getRemoteConfig = async (
    configNamespace: ConfigNamespace,
    key: string,
    sessionId?: number,
  ): Promise<RemoteConfig | void> => {
    // Then check IndexedDB for session
    if (this.remoteConfigIDBStore) {
      const idbRemoteConfig = await this.remoteConfigIDBStore.getRemoteConfig(configNamespace, key);
      const lastFetchedSessionId = await this.remoteConfigIDBStore.getLastFetchedSessionId();
      if (idbRemoteConfig && lastFetchedSessionId === sessionId) {
        return idbRemoteConfig;
      }
    }
    // Finally fetch via API
    const configAPIResponse = await this.fetchWithTimeout(sessionId);
    return configAPIResponse && configAPIResponse.configs && configAPIResponse.configs[configNamespace];
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

  fetchWithTimeout = async (sessionId?: number): Promise<RemoteConfigAPIResponse | void> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const remoteConfig = await this.fetchRemoteConfig(controller.signal, sessionId);
    clearTimeout(timeoutId);
    return remoteConfig;
  };

  fetchRemoteConfig = async (
    signal: AbortController['signal'],
    sessionId?: number,
  ): Promise<RemoteConfigAPIResponse | void> => {
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
  ): Promise<RemoteConfigAPIResponse | void> => {
    await new Promise((resolve) => setTimeout(resolve, this.attempts * this.retryTimeout));
    return this.fetchRemoteConfig(signal, sessionId);
  };

  parseAndStoreConfig = async (res: Response, sessionId?: number): Promise<RemoteConfigAPIResponse> => {
    const remoteConfig: RemoteConfigAPIResponse = (await res.json()) as RemoteConfigAPIResponse;
    this.completeRequest({ success: SUCCESS_REMOTE_CONFIG });
    this.remoteConfigIDBStore && void this.remoteConfigIDBStore.storeRemoteConfig(remoteConfig, sessionId);
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

export const createRemoteConfigFetch = async ({
  localConfig,
  configKeys,
}: {
  localConfig: Config;
  configKeys: ConfigNamespace[];
}): Promise<RemoteConfigFetch> => {
  const remoteConfigFetch = new RemoteConfigFetch({ localConfig, configKeys });
  await remoteConfigFetch.initialize();
  return remoteConfigFetch;
};
