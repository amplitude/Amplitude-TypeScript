import { BaseTransport } from '@amplitude/analytics-core';
import { Config, Status } from '@amplitude/analytics-types';
import {
  CreateRemoteConfigFetch,
  RemoteConfigFetch as IRemoteConfigFetch,
  RemoteConfigAPIResponse,
  RemoteConfigMetric,
} from './types';

const UNEXPECTED_NETWORK_ERROR_MESSAGE = 'Network error occurred, remote config fetch failed';
const SUCCESS_REMOTE_CONFIG = 'Remote config successfully fetched';
const MAX_RETRIES_EXCEEDED_MESSAGE = 'Remote config fetch rejected due to exceeded retry count';
const TIMEOUT_MESSAGE = 'Remote config fetch rejected due to timeout after 5 seconds';
const UNEXPECTED_ERROR_MESSAGE = 'Unexpected error occurred';

export const REMOTE_CONFIG_SERVER_URL = 'https://sr-client-cfg.amplitude.com/config';
export const REMOTE_CONFIG_SERVER_URL_STAGING = 'https://sr-client-cfg.stag2.amplitude.com/config';
export const REMOTE_CONFIG_SERVER_URL_EU = 'https://sr-client-cfg.eu.amplitude.com/config';

export class RemoteConfigFetch<RemoteConfig extends { [key: string]: object }> implements IRemoteConfigFetch<RemoteConfig> {
  localConfig: Config;
  retryTimeout = 1000;
  attempts = 0;
  lastFetchedSessionId: number | undefined;
  sessionTargetingMatch = false;
  configKeys: string[];
  metrics: RemoteConfigMetric = {};

  constructor({ localConfig, configKeys }: { localConfig: Config; configKeys: string[] }) {
    this.localConfig = localConfig;
    this.configKeys = configKeys;
  }

  getRemoteConfig = async <K extends keyof RemoteConfig>(
    configNamespace: string,
    key: K,
    sessionId?: number,
    fail?: boolean,
  ): Promise<RemoteConfig[K] | undefined> => {
    const fetchStartTime = Date.now();
    // Finally fetch via API
    const configAPIResponse = await this.fetchWithTimeout(fail ?? false, sessionId);
    if (configAPIResponse) {
      const remoteConfig = configAPIResponse.configs && configAPIResponse.configs[configNamespace];
      if (remoteConfig) {
        this.metrics.fetchTimeAPISuccess = Date.now() - fetchStartTime;
        return remoteConfig[key];
      }
    }
    this.metrics.fetchTimeAPIFail = Date.now() - fetchStartTime;
    return undefined;
  };

  getServerUrl() {
    return 'http://localhost:5000/config';
    // if (this.localConfig.serverZone === ServerZone.STAGING) {
    //   return REMOTE_CONFIG_SERVER_URL_STAGING;
    // }

    // if (this.localConfig.serverZone === ServerZone.EU) {
    //   return REMOTE_CONFIG_SERVER_URL_EU;
    // }

    // return REMOTE_CONFIG_SERVER_URL;
  }

  fetchWithTimeout = async (
    fail: boolean,
    sessionId?: number,
  ): Promise<RemoteConfigAPIResponse<RemoteConfig> | void> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const remoteConfig = await this.fetchRemoteConfig(controller.signal, fail, sessionId);
    clearTimeout(timeoutId);
    return remoteConfig;
  };

  fetchRemoteConfig = async (
    signal: AbortController['signal'],
    fail: boolean,
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
      });
      for (const configKey of this.configKeys) {
        urlParams.append('config_keys', configKey);
      }
      if (sessionId) {
        urlParams.set('session_id', String(sessionId));
      }
      urlParams.set('fail', String(fail));
      const options: RequestInit = {
        headers: {
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
          return this.parseAndStoreConfig(res);
        case Status.Failed:
          return this.retryFetch(signal, fail, sessionId);
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
    fail: boolean,
    sessionId?: number,
  ): Promise<RemoteConfigAPIResponse<RemoteConfig> | void> => {
    await new Promise((resolve) => setTimeout(resolve, this.attempts * this.retryTimeout));
    return this.fetchRemoteConfig(signal, fail, sessionId);
  };

  parseAndStoreConfig = async (res: Response): Promise<RemoteConfigAPIResponse<RemoteConfig>> => {
    const remoteConfig: RemoteConfigAPIResponse<RemoteConfig> =
      (await res.json()) as RemoteConfigAPIResponse<RemoteConfig>;
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
  return new RemoteConfigFetch<RemoteConfig>({ localConfig, configKeys });
};
