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
      if (samplingConfig && Object.keys(samplingConfig).length > 0) {
        if (Object.prototype.hasOwnProperty.call(samplingConfig, 'capture_enabled')) {
          config.captureEnabled = samplingConfig.capture_enabled;
        } else {
          config.captureEnabled = false;
        }

        if (samplingConfig.sample_rate) {
          config.sampleRate = samplingConfig.sample_rate;
        }
      } else {
        // If config API response was valid (ie 200), but no config returned, assume that
        // customer has not yet set up config, and use sample rate from SDK options,
        // allowing for immediate replay capture
        config.captureEnabled = true;
      }
    } catch (err: unknown) {
      const knownError = err as Error;
      this.localConfig.loggerProvider.warn(knownError.message);
      config.captureEnabled = true;
    }

    return config;
  }
}
