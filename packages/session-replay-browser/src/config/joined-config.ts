import { RemoteConfigFetch, createRemoteConfigFetch } from '@amplitude/analytics-remote-config';
import { SessionReplayOptions } from '../typings/session-replay';
import { SessionReplayLocalConfig } from './local-config';
import {
  SessionReplayLocalConfig as ISessionReplayLocalConfig,
  SessionReplayJoinedConfig,
  SessionReplayRemoteConfig,
} from './types';

export class SessionReplayJoinedConfigGenerator {
  localConfig: ISessionReplayLocalConfig;
  remoteConfigFetch: RemoteConfigFetch<SessionReplayRemoteConfig> | undefined;

  constructor(apiKey: string, options: SessionReplayOptions) {
    this.localConfig = new SessionReplayLocalConfig(apiKey, options);
  }

  async initialize() {
    this.remoteConfigFetch = await createRemoteConfigFetch<SessionReplayRemoteConfig>({
      localConfig: this.localConfig,
      configKeys: ['sessionReplay'],
    });
  }

  async generateJoinedConfig(sessionId?: number): Promise<SessionReplayJoinedConfig> {
    const config: SessionReplayJoinedConfig = { ...this.localConfig };
    // Special case here as optOut is implemented via getter/setter
    config.optOut = this.localConfig.optOut;
    // We always want captureEnabled to be true, unless there's an override
    // in the remote config.
    config.captureEnabled = true;
    let remoteConfig: SessionReplayRemoteConfig | undefined;
    try {
      if (!this.remoteConfigFetch) {
        return config;
      }

      const samplingConfig = await this.remoteConfigFetch.getRemoteConfig(
        'sessionReplay',
        'sr_sampling_config',
        sessionId,
      );

      const privacyConfig = await this.remoteConfigFetch.getRemoteConfig(
        'sessionReplay',
        'sr_privacy_config',
        sessionId,
      );

      if (samplingConfig || privacyConfig) {
        remoteConfig = {};
        if (samplingConfig) {
          remoteConfig.sr_sampling_config = samplingConfig;
        }
        if (privacyConfig) {
          remoteConfig.sr_privacy_config = privacyConfig;
        }
      }
    } catch (err: unknown) {
      const knownError = err as Error;
      this.localConfig.loggerProvider.warn(knownError.message);
      config.captureEnabled = true;
    }

    if (!remoteConfig) {
      return config;
    }

    const { sr_sampling_config: samplingConfig, sr_privacy_config: privacyConfig } = remoteConfig;
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
      this.localConfig.loggerProvider.debug(
        'Remote config successfully fetched, but no values set for project, Session Replay capture enabled.',
      );
    }

    // Override all keys in the local config with the remote privacy config.
    config.privacyConfig = {
      ...(config.privacyConfig ?? {}),
      ...privacyConfig,
    };

    return config;
  }
}

export const createSessionReplayJoinedConfigGenerator = async (apiKey: string, options: SessionReplayOptions) => {
  const joinedConfigGenerator = new SessionReplayJoinedConfigGenerator(apiKey, options);
  await joinedConfigGenerator.initialize();
  return joinedConfigGenerator;
};
