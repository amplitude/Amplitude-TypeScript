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
export const REMOTE_CONFIG_SERVER_URL = 'https://sr-config.amplitude.com/config';
export const REMOTE_CONFIG_SERVER_URL_STAGING = 'https://sr-client-cfg.stag2.amplitude.com/config';

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

  getRemoteConfig = async (sessionId: number): Promise<ISessionReplayRemoteConfig | void> => {
    // Then check IndexedDB for session
    const remoteConfig = await this.sessionIDBStore.getRemoteConfigForSession(sessionId);
    if (remoteConfig) {
      return remoteConfig;
    }
    // Finally fetch via API
    return this.fetchRemoteConfig(sessionId);
  };

  getSamplingConfig = async (sessionId: number): Promise<SamplingConfig | void> => {
    const remoteConfig = await this.getRemoteConfig(sessionId);
    return remoteConfig?.sr_sampling_config;
  };

  getServerUrl() {
    if (this.localConfig.serverZone === ServerZone.STAGING) {
      return REMOTE_CONFIG_SERVER_URL_STAGING;
    }

    return REMOTE_CONFIG_SERVER_URL;
  }

  fetchRemoteConfig = async (sessionId: number): Promise<ISessionReplayRemoteConfig | void> => {
    if (sessionId === this.lastFetchedSessionId && this.attempts >= this.localConfig.flushMaxRetries) {
      return this.completeRequest({ err: MAX_RETRIES_EXCEEDED_MESSAGE });
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
      const server_url = `${this.getServerUrl()}?${urlParams.toString()}`;
      this.attempts += 1;
      const res = await fetch(server_url, options);
      if (res === null) {
        return this.completeRequest({ err: UNEXPECTED_ERROR_MESSAGE });
      }
      const parsedStatus = new BaseTransport().buildStatus(res.status);
      switch (parsedStatus) {
        case Status.Success:
          return this.parseAndStoreConfig(sessionId, res);
        case Status.Failed:
          return this.retryFetch(sessionId);
        default:
          return this.completeRequest({ err: UNEXPECTED_NETWORK_ERROR_MESSAGE });
      }
    } catch (e) {
      return this.completeRequest({ err: e as string });
    }
  };

  retryFetch = async (sessionId: number): Promise<ISessionReplayRemoteConfig | void> => {
    await new Promise((resolve) => setTimeout(resolve, this.attempts * this.retryTimeout));
    return this.fetchRemoteConfig(sessionId);
  };

  parseAndStoreConfig = async (sessionId: number, res: Response): Promise<ISessionReplayRemoteConfig> => {
    const remoteConfig: SessionReplayRemoteConfigAPIResponse =
      (await res.json()) as SessionReplayRemoteConfigAPIResponse;
    this.completeRequest({ success: SUCCESS_REMOTE_CONFIG });
    void this.sessionIDBStore.storeRemoteConfigForSession(sessionId, remoteConfig.configs.sessionReplay);
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
