import { BaseTransport } from '@amplitude/analytics-core';
import { Status } from '@amplitude/analytics-types';
import { TargetingFlag } from '@amplitude/targeting';
import { SESSION_REPLAY_SERVER_URL } from './constants';
import { UNEXPECTED_ERROR_MESSAGE } from './messages';
import {
  SessionReplayRemoteConfigFetch as AmplitudeSessionReplayRemoteConfigFetch,
  SessionReplayConfig,
  SessionReplayRemoteConfig,
} from './typings/session-replay';

export const UNEXPECTED_NETWORK_ERROR_MESSAGE = 'Network error occurred, session replay remote config fetch failed';
export const SUCCESS_REMOTE_CONFIG = 'Session replay remote config successfully fetched';
export const MISSING_API_KEY_MESSAGE = 'Session replay remote config not fetched due to missing api key';

export class SessionReplayRemoteConfigFetch implements AmplitudeSessionReplayRemoteConfigFetch {
  config: SessionReplayConfig;
  remoteConfig: SessionReplayRemoteConfig | undefined;
  retryTimeout = 1000;
  attempts = 0;

  constructor({ config }: { config: SessionReplayConfig }) {
    this.config = config;
  }

  getRemoteConfig = (): Promise<SessionReplayRemoteConfig | void> => {
    if (this.remoteConfig) {
      return Promise.resolve(this.remoteConfig);
    }
    return this.fetchRemoteConfig();
  };

  getTargetingConfig = async (): Promise<TargetingFlag | void> => {
    const remoteConfig = await this.getRemoteConfig();
    return remoteConfig?.sr_targeting_config;
  };

  getServerUrl() {
    return SESSION_REPLAY_SERVER_URL;
  }

  fetchRemoteConfig = async (): Promise<SessionReplayRemoteConfig | void> => {
    try {
      const options: RequestInit = {
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        method: 'GET',
      };
      const urlParams = new URLSearchParams({});
      const server_url = `${this.getServerUrl()}?${urlParams.toString()}`;
      const res = await fetch(server_url, options);
      this.attempts += 1;
      if (res === null) {
        return this.completeRequest({ err: UNEXPECTED_ERROR_MESSAGE });
      }
      const parsedStatus = new BaseTransport().buildStatus(res.status);
      switch (parsedStatus) {
        case Status.Success:
          return this.parseAndStoreConfig(res);
        case Status.Failed:
          return this.maybeRetryFetch();
        default:
          return this.completeRequest({ err: UNEXPECTED_NETWORK_ERROR_MESSAGE });
      }
    } catch (e) {
      return this.completeRequest({ err: e as string });
    }
  };

  maybeRetryFetch = async (): Promise<SessionReplayRemoteConfig | void> => {
    if (this.attempts < this.config.flushMaxRetries) {
      await new Promise((resolve) => setTimeout(resolve, this.attempts * this.retryTimeout));
      return this.fetchRemoteConfig();
    }
    return this.completeRequest({ err: UNEXPECTED_NETWORK_ERROR_MESSAGE });
  };

  parseAndStoreConfig = async (res: Response): Promise<SessionReplayRemoteConfig> => {
    const remoteConfig: SessionReplayRemoteConfig = (await res.json()) as SessionReplayRemoteConfig;
    this.completeRequest({ success: SUCCESS_REMOTE_CONFIG });
    this.remoteConfig = remoteConfig;
    return remoteConfig;
  };

  completeRequest({ err, success }: { err?: string; success?: string }) {
    this.attempts = 0; // Reset attempts back to 0 for restart
    if (err) {
      this.config.loggerProvider.warn(err);
    } else if (success) {
      this.config.loggerProvider.log(success);
    }
  }
}
