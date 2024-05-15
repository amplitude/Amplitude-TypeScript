import { createRemoteConfigFetch, RemoteConfigFetch } from '@amplitude/analytics-remote-config';
import { SessionReplayOptions } from '../typings/session-replay';
import { SessionReplayLocalConfig } from './local-config';
import {
  SessionReplayLocalConfig as ISessionReplayLocalConfig,
  SessionReplayJoinedConfig,
  SessionReplayPrivacyConfig,
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

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const samplingConfig =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        (await this.remoteConfigFetch.getRemoteConfig(
          'sessionReplay',
          'sr_sampling_config',
          sessionId,
        )) as SessionReplayRemoteConfig['sr_sampling_config'];

      const privacyConfig =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        (await this.remoteConfigFetch.getRemoteConfig(
          'sessionReplay',
          'sr_privacy_config',
          sessionId,
        )) as SessionReplayRemoteConfig['sr_privacy_config'];

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
        'assuming config API response was valid, but no config returned. session replay capture enabled.',
      );
    }

    // Override all keys in the local config with the remote privacy config.
    if (privacyConfig && Object.keys(privacyConfig).length > 0) {
      if (!config.privacyConfig) {
        config.privacyConfig = {};
      }

      for (const key in privacyConfig) {
        const k = key as keyof SessionReplayPrivacyConfig;
        config.privacyConfig[k] = privacyConfig[k];
      }
    }

    return config;
  }
}

export const createSessionReplayJoinedConfigGenerator = async (apiKey: string, options: SessionReplayOptions) => {
  const joinedConfigGenerator = new SessionReplayJoinedConfigGenerator(apiKey, options);
  await joinedConfigGenerator.initialize();
  return joinedConfigGenerator;
};
