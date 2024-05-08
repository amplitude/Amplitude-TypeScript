import { BaseTransport } from '@amplitude/analytics-core';
import { ServerZone, Status } from '@amplitude/analytics-types';
import { UNEXPECTED_ERROR_MESSAGE } from '../messages';
import { SessionReplaySessionIDBStore as AmplitudeSessionReplaySessionIDBStore } from '../typings/session-replay';
import {
  SessionReplayLocalConfig as ISessionReplayLocalConfig,
  SessionReplayRemoteConfig as ISessionReplayRemoteConfig,
  SessionReplayRemoteConfigFetch as ISessionReplayRemoteConfigFetch,
  SamplingConfig,
  SessionReplayRemoteConfigAPIResponse,
} from './types';

const UNEXPECTED_NETWORK_ERROR_MESSAGE = 'Network error occurred, session replay remote config fetch failed';
const SUCCESS_REMOTE_CONFIG = 'Session replay remote config successfully fetched';
const MAX_RETRIES_EXCEEDED_MESSAGE = 'Session replay remote config fetch rejected due to exceeded retry count';
const TIMEOUT_MESSAGE = 'Session replay remote config fetch rejected due to timeout after 5 seconds';
export const REMOTE_CONFIG_SERVER_URL = 'https://sr-client-cfg.amplitude.com/config';
export const REMOTE_CONFIG_SERVER_URL_STAGING = 'https://sr-client-cfg.stag2.amplitude.com/config';
export const REMOTE_CONFIG_SERVER_URL_EU = 'https://sr-client-cfg.eu.amplitude.com/config';

export class SessionReplayRemoteConfigFetch implements ISessionReplayRemoteConfigFetch {
  localConfig: ISessionReplayLocalConfig;
  sessionIDBStore: AmplitudeSessionReplaySessionIDBStore;
  retryTimeout = 1000;
  attempts = 0;
  lastFetchedSessionId: number | undefined;
  sessionTargetingMatch = false;

  constructor({
    localConfig,
    sessionIDBStore,
  }: {
    localConfig: ISessionReplayLocalConfig;
    sessionIDBStore: AmplitudeSessionReplaySessionIDBStore;
  }) {
    this.localConfig = localConfig;
    this.sessionIDBStore = sessionIDBStore;
  }

  getRemoteConfig = async (sessionId?: number): Promise<ISessionReplayRemoteConfig | void> => {
    // Then check IndexedDB for session
    const idbRemoteConfig = await this.sessionIDBStore.getRemoteConfig();
    if (idbRemoteConfig && idbRemoteConfig.lastFetchedSessionId === sessionId) {
      return idbRemoteConfig.config;
    }
    // Finally fetch via API
    return this.fetchWithTimeout(sessionId);
  };

  getSamplingConfig = async (sessionId?: number): Promise<SamplingConfig | void> => {
    const remoteConfig = await this.getRemoteConfig(sessionId);
    return remoteConfig?.sr_sampling_config;
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

  fetchWithTimeout = async (sessionId?: number): Promise<ISessionReplayRemoteConfig | void> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const remoteConfig = await this.fetchRemoteConfig(controller.signal, sessionId);
    clearTimeout(timeoutId);
    return remoteConfig;
  };

  fetchRemoteConfig = async (
    signal: AbortController['signal'],
    sessionId?: number,
  ): Promise<ISessionReplayRemoteConfig | void> => {
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
        config_keys: 'sessionReplay',
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
  ): Promise<ISessionReplayRemoteConfig | void> => {
    await new Promise((resolve) => setTimeout(resolve, this.attempts * this.retryTimeout));
    return this.fetchRemoteConfig(signal, sessionId);
  };

  parseAndStoreConfig = async (res: Response, sessionId?: number): Promise<ISessionReplayRemoteConfig> => {
    const remoteConfig: SessionReplayRemoteConfigAPIResponse =
      (await res.json()) as SessionReplayRemoteConfigAPIResponse;
    this.completeRequest({ success: SUCCESS_REMOTE_CONFIG });
    void this.sessionIDBStore.storeRemoteConfig(remoteConfig.configs.sessionReplay, sessionId);
    return remoteConfig.configs.sessionReplay;
  };

  completeRequest({ err, success }: { err?: string; success?: string }) {
    if (err) {
      throw new Error(err);
    } else if (success) {
      this.localConfig.loggerProvider.log(success);
    }
  }
}
