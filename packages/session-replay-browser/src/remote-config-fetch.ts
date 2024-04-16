import { BaseTransport } from '@amplitude/analytics-core';
import { Status } from '@amplitude/analytics-types';
import { TargetingFlag, TargetingParameters, evaluateTargeting } from '@amplitude/targeting';
import { UNEXPECTED_ERROR_MESSAGE } from './messages';
import {
  SessionReplayRemoteConfigFetch as AmplitudeSessionReplayRemoteConfigFetch,
  SessionReplaySessionIDBStore as AmplitudeSessionReplaySessionIDBStore,
  SessionReplayConfig,
  SessionReplayRemoteConfig,
} from './typings/session-replay';

const UNEXPECTED_NETWORK_ERROR_MESSAGE = 'Network error occurred, session replay remote config fetch failed';
const SUCCESS_REMOTE_CONFIG = 'Session replay remote config successfully fetched';
const SERVER_URL = '/sessions/v2/targeting.json';

export class SessionReplayRemoteConfigFetch implements AmplitudeSessionReplayRemoteConfigFetch {
  config: SessionReplayConfig;
  remoteConfig: SessionReplayRemoteConfig | undefined;
  sessionIDBStore: AmplitudeSessionReplaySessionIDBStore;
  retryTimeout = 1000;
  attempts = 0;
  sessionTargetingMatch = false;

  constructor({
    config,
    sessionIDBStore,
  }: {
    config: SessionReplayConfig;
    sessionIDBStore: AmplitudeSessionReplaySessionIDBStore;
  }) {
    this.config = config;
    this.sessionIDBStore = sessionIDBStore;
  }

  /**
   * Once targeting has been evaluated to positive for the session,
   * it should not be reevaluated. A sessionTargetingMatch of true should
   * stay true for the remainder of the session.
   */
  evaluateTargeting = async (targetingParams: Omit<TargetingParameters, 'flag'>) => {
    // First check memory for existing true decision
    if (this.sessionTargetingMatch === true) {
      return;
    }

    // Then check IndexedDB for existing true decision
    const idbTargetingMatch = await this.sessionIDBStore.getTargetingMatchForSession(targetingParams.sessionId);
    if (idbTargetingMatch === true) {
      this.sessionTargetingMatch = true;
      return;
    }

    // Finally evaluate targeting if previous two checks were false or undefined
    try {
      const targetingConfig = await this.getTargetingConfig(targetingParams.sessionId);
      if (targetingConfig && Object.keys(targetingConfig).length > 0) {
        const targetingResult = evaluateTargeting({ ...targetingParams, flag: targetingConfig });
        this.sessionTargetingMatch =
          this.sessionTargetingMatch === false && targetingResult.sr_targeting_config.key === 'on';
      } else {
        // If the targeting config is undefined or an empty object,
        // assume the response was valid but no conditions were set,
        // so all users match targeting
        this.sessionTargetingMatch = true;
      }
      void this.sessionIDBStore.storeTargetingMatchForSession(targetingParams.sessionId, this.sessionTargetingMatch);
    } catch (err: unknown) {
      const knownError = err as Error;
      this.config.loggerProvider.warn(knownError.message);
    }
  };

  getRemoteConfig = async (sessionId: number): Promise<SessionReplayRemoteConfig | void> => {
    // First check memory
    if (this.remoteConfig) {
      return Promise.resolve(this.remoteConfig);
    }
    // Then check IndexedDB for session
    const remoteConfig = await this.sessionIDBStore.getRemoteConfigForSession(sessionId);
    if (remoteConfig) {
      return remoteConfig;
    }
    // Finally fetch via API
    return this.fetchRemoteConfig(sessionId);
  };

  getTargetingConfig = async (sessionId: number): Promise<TargetingFlag | void> => {
    const remoteConfig = await this.getRemoteConfig(sessionId);
    return remoteConfig?.sr_targeting_config;
  };

  getServerUrl() {
    return SERVER_URL;
  }

  fetchRemoteConfig = async (sessionId: number): Promise<SessionReplayRemoteConfig | void> => {
    try {
      const options: RequestInit = {
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        method: 'GET',
      };
      const server_url = `${this.getServerUrl()}`;
      const res = await fetch(server_url, options);
      this.attempts += 1;
      if (res === null) {
        return this.completeRequest({ err: UNEXPECTED_ERROR_MESSAGE });
      }
      const parsedStatus = new BaseTransport().buildStatus(res.status);
      switch (parsedStatus) {
        case Status.Success:
          return this.parseAndStoreConfig(sessionId, res);
        case Status.Failed:
          return this.maybeRetryFetch(sessionId);
        default:
          return this.completeRequest({ err: UNEXPECTED_NETWORK_ERROR_MESSAGE });
      }
    } catch (e) {
      return this.completeRequest({ err: e as string });
    }
  };

  maybeRetryFetch = async (sessionId: number): Promise<SessionReplayRemoteConfig | void> => {
    if (this.attempts < this.config.flushMaxRetries) {
      await new Promise((resolve) => setTimeout(resolve, this.attempts * this.retryTimeout));
      return this.fetchRemoteConfig(sessionId);
    }
    return this.completeRequest({ err: UNEXPECTED_NETWORK_ERROR_MESSAGE });
  };

  parseAndStoreConfig = async (sessionId: number, res: Response): Promise<SessionReplayRemoteConfig> => {
    const remoteConfig: SessionReplayRemoteConfig = (await res.json()) as SessionReplayRemoteConfig;
    this.completeRequest({ success: SUCCESS_REMOTE_CONFIG });
    this.remoteConfig = remoteConfig;
    void this.sessionIDBStore.storeRemoteConfigForSession(sessionId, remoteConfig);
    return remoteConfig;
  };

  completeRequest({ err, success }: { err?: string; success?: string }) {
    this.attempts = 0; // Reset attempts back to 0 for restart
    if (err) {
      throw new Error(err);
    } else if (success) {
      this.config.loggerProvider.log(success);
    }
  }
}
