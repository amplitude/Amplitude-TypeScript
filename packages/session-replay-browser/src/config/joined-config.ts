import { RemoteConfigFetch, createRemoteConfigFetch } from '@amplitude/analytics-remote-config';
import { Logger } from '@amplitude/analytics-types';
import { getDebugConfig } from '../helpers';
import { SessionReplayOptions } from '../typings/session-replay';
import { SessionReplayLocalConfig } from './local-config';
import {
  SessionReplayLocalConfig as ISessionReplayLocalConfig,
  PrivacyConfig,
  SessionReplayJoinedConfig,
  SessionReplayRemoteConfig,
} from './types';

export const removeInvalidSelectorsFromPrivacyConfig = (privacyConfig: PrivacyConfig, loggerProvider: Logger) => {
  // This allows us to not search the DOM.
  const fragment = document.createDocumentFragment();

  const dropInvalidSelectors = (selectors: string[] | string = []): string[] | undefined => {
    if (typeof selectors === 'string') {
      selectors = [selectors];
    }
    selectors = selectors.filter((selector: string) => {
      try {
        fragment.querySelector(selector);
      } catch {
        loggerProvider.warn(`[session-replay-browser] omitting selector "${selector}" because it is invalid`);
        return false;
      }
      return true;
    });
    if (selectors.length === 0) {
      return undefined;
    }
    return selectors;
  };
  privacyConfig.blockSelector = dropInvalidSelectors(privacyConfig.blockSelector);
  privacyConfig.maskSelector = dropInvalidSelectors(privacyConfig.maskSelector);
  privacyConfig.unmaskSelector = dropInvalidSelectors(privacyConfig.unmaskSelector);
  return privacyConfig;
};
export class SessionReplayJoinedConfigGenerator {
  private readonly localConfig: ISessionReplayLocalConfig;
  private readonly remoteConfigFetch: RemoteConfigFetch<SessionReplayRemoteConfig>;

  constructor(remoteConfigFetch: RemoteConfigFetch<SessionReplayRemoteConfig>, localConfig: ISessionReplayLocalConfig) {
    this.localConfig = localConfig;
    this.remoteConfigFetch = remoteConfigFetch;
  }

  async generateJoinedConfig(sessionId?: string | number): Promise<SessionReplayJoinedConfig> {
    const config: SessionReplayJoinedConfig = { ...this.localConfig };
    // Special case here as optOut is implemented via getter/setter
    config.optOut = this.localConfig.optOut;
    // We always want captureEnabled to be true, unless there's an override
    // in the remote config.
    config.captureEnabled = true;
    let remoteConfig: SessionReplayRemoteConfig | undefined;
    try {
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

      // This is intentionally forced to only be set through the remote config.
      config.interactionConfig = await this.remoteConfigFetch.getRemoteConfig(
        'sessionReplay',
        'sr_interaction_config',
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
      config.captureEnabled = false;
    }

    if (!remoteConfig) {
      return config;
    }

    const { sr_sampling_config: samplingConfig, sr_privacy_config: remotePrivacyConfig } = remoteConfig;
    if (samplingConfig && Object.keys(samplingConfig).length > 0) {
      if (Object.prototype.hasOwnProperty.call(samplingConfig, 'capture_enabled')) {
        config.captureEnabled = samplingConfig.capture_enabled;
      } else {
        config.captureEnabled = false;
      }

      if (Object.prototype.hasOwnProperty.call(samplingConfig, 'sample_rate')) {
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

    // Remote config join acts somewhat like a left join between the remote and the local
    // config. That is, remote config has precedence over local values as with sampling.
    // However, non conflicting values will be added to the lists.
    // Here's an example to illustrate:
    //
    // Remote config:   {'.selector1': 'MASK',   '.selector2': 'UNMASK'}
    // Local config:    {'.selector1': 'UNMASK',                         '.selector3': 'MASK'}
    //
    // Resolved config: {'.selector1': 'MASK',   '.selector2': 'UNMASK', '.selector3': 'MASK'}
    // config.privacyConfig = {
    //   ...(config.privacyConfig ?? {}),
    //   ...remotePrivacyConfig,
    // };

    if (remotePrivacyConfig) {
      const localPrivacyConfig: PrivacyConfig = config.privacyConfig ?? {};

      const joinedPrivacyConfig: Required<PrivacyConfig> & { blockSelector: string[] } = {
        defaultMaskLevel: remotePrivacyConfig.defaultMaskLevel ?? localPrivacyConfig.defaultMaskLevel ?? 'medium',
        blockSelector: [],
        maskSelector: [],
        unmaskSelector: [],
      };

      const privacyConfigSelectorMap = (privacyConfig: PrivacyConfig): Record<string, 'mask' | 'unmask' | 'block'> => {
        const selectorMap: Record<string, 'mask' | 'unmask' | 'block'> = {};
        if (typeof privacyConfig.blockSelector === 'string') {
          privacyConfig.blockSelector = [privacyConfig.blockSelector];
        }

        for (const selector of privacyConfig.blockSelector ?? []) {
          selectorMap[selector] = 'block';
        }
        for (const selector of privacyConfig.maskSelector ?? []) {
          selectorMap[selector] = 'mask';
        }
        for (const selector of privacyConfig.unmaskSelector ?? []) {
          selectorMap[selector] = 'unmask';
        }
        return selectorMap;
      };

      const selectorMap: Record<string, 'mask' | 'unmask' | 'block'> = {
        ...privacyConfigSelectorMap(localPrivacyConfig),
        ...privacyConfigSelectorMap(remotePrivacyConfig),
      };

      for (const [selector, selectorType] of Object.entries(selectorMap)) {
        if (selectorType === 'mask') {
          joinedPrivacyConfig.maskSelector.push(selector);
        } else if (selectorType === 'block') {
          joinedPrivacyConfig.blockSelector.push(selector);
        } else if (selectorType === 'unmask') {
          joinedPrivacyConfig.unmaskSelector.push(selector);
        }
      }

      config.privacyConfig = removeInvalidSelectorsFromPrivacyConfig(
        joinedPrivacyConfig,
        this.localConfig.loggerProvider,
      );
    }

    this.localConfig.loggerProvider.debug(
      JSON.stringify({ name: 'session replay joined config', config: getDebugConfig(config) }, null, 2),
    );

    return config;
  }
}

export const createSessionReplayJoinedConfigGenerator = async (apiKey: string, options: SessionReplayOptions) => {
  const localConfig = new SessionReplayLocalConfig(apiKey, options);
  const remoteConfigFetch = await createRemoteConfigFetch<SessionReplayRemoteConfig>({
    localConfig,
    configKeys: ['sessionReplay'],
  });

  return new SessionReplayJoinedConfigGenerator(remoteConfigFetch, localConfig);
};
