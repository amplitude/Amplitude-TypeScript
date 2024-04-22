import {
  SessionReplaySessionIDBStore as AmplitudeSessionReplaySessionIDBStore,
  SessionReplayOptions,
} from '../typings/session-replay';
import { SessionReplayLocalConfig } from './local-config';
import { SessionReplayRemoteConfigFetch } from './remote-config';
import {
  SessionReplayLocalConfig as ISessionReplayLocalConfig,
  SessionReplayRemoteConfigFetch as ISessionReplayRemoteConfigFetch,
  SessionReplayJoinedConfig,
} from './types';

export class SessionReplayJoinedConfigGenerator {
  localConfig: ISessionReplayLocalConfig;
  remoteConfigFetch: ISessionReplayRemoteConfigFetch;
  sessionIDBStore: AmplitudeSessionReplaySessionIDBStore;

  constructor(apiKey: string, options: SessionReplayOptions, sessionIDBStore: AmplitudeSessionReplaySessionIDBStore) {
    this.sessionIDBStore = sessionIDBStore;
    this.localConfig = new SessionReplayLocalConfig(apiKey, options);
    this.remoteConfigFetch = new SessionReplayRemoteConfigFetch({
      localConfig: this.localConfig,
      sessionIDBStore: this.sessionIDBStore,
    });
  }

  async generateJoinedConfig(sessionId: number) {
    const config: SessionReplayJoinedConfig = { ...this.localConfig };
    // Special case here as optOut is implemented via getter/setter
    config.optOut = this.localConfig.optOut;
    try {
      const samplingConfig = await this.remoteConfigFetch.getSamplingConfig(sessionId);

      if (samplingConfig) {
        if (Object.prototype.hasOwnProperty.call(samplingConfig, 'capture_enabled')) {
          config.captureEnabled = samplingConfig.capture_enabled;
        } else {
          config.captureEnabled = true;
        }

        if (samplingConfig.sample_rate) {
          config.sampleRate = samplingConfig.sample_rate;
        }
      } else {
        config.captureEnabled = true;
      }
    } catch (err: unknown) {
      const knownError = err as Error;
      this.localConfig.loggerProvider.warn(knownError.message);
      config.captureEnabled = false;
    }

    return config;
  }
}
