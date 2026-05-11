import { ILogger, IRemoteConfigClient, RemoteConfigClient, RemoteConfig, Source } from '@amplitude/analytics-core';
import { getDebugConfig } from '../helpers';
import { SessionReplayOptions } from '../typings/session-replay';
import { SessionReplayLocalConfig } from './local-config';
import {
  SessionReplayLocalConfig as ISessionReplayLocalConfig,
  PrivacyConfig,
  SessionReplayConfigs,
  SessionReplayJoinedConfig,
  SessionReplayRemoteConfig,
} from './types';

// Budget for waiting on the remote config response before falling back to the local cache.
// The inner fetch in analytics-core uses a 1000ms per-attempt AbortController timeout with
// up to 3 retries — but this outer timeout is the only thing the SR plugin waits on, so
// only the first attempt can possibly complete in time (attempt 2 starts at ~1000-1333ms
// after backoff jitter and runs to ~2000-2333ms, well past any reasonable outer budget).
// 1500ms is set above the 1000ms inner abort to avoid a tie with the inner cutoff and
// give the first attempt's resolution path room to finish; everything else falls through
// to the cache fallback. See SR-4234: prefer remote over a stale cache that would
// otherwise win the synchronous race in 'all' mode.
const REMOTE_CONFIG_TIMEOUT_MS = 1500;

export const removeInvalidSelectorsFromPrivacyConfig = (privacyConfig: PrivacyConfig, loggerProvider: ILogger) => {
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
  private readonly remoteConfigClient: IRemoteConfigClient;

  constructor(remoteConfigClient: IRemoteConfigClient, localConfig: ISessionReplayLocalConfig) {
    this.localConfig = localConfig;
    this.remoteConfigClient = remoteConfigClient;
  }

  async generateJoinedConfig(): Promise<SessionReplayConfigs> {
    const config: SessionReplayJoinedConfig = { ...this.localConfig };
    // Special case here as optOut is implemented via getter/setter
    config.optOut = this.localConfig.optOut;
    // We always want captureEnabled to be true, unless there's an override
    // in the remote config.
    config.captureEnabled = true;
    let sessionReplayRemoteConfig: SessionReplayRemoteConfig | undefined;

    try {
      // Subscribe with a timeout so the SDK prefers the remote response and only falls back
      // to cache after the budget elapses. 'all' mode would race a synchronous cache read
      // against the network and resolve on whichever fires first — cache always wins, so a
      // stale cache silently overrides the live config (SR-4234).
      await new Promise<void>((resolve, reject) => {
        this.remoteConfigClient.subscribe(
          'configs.sessionReplay',
          { timeout: REMOTE_CONFIG_TIMEOUT_MS },
          (remoteConfig: RemoteConfig | null, source: Source) => {
            this.localConfig.loggerProvider.debug(
              `Session Replay remote configuration received from ${source}:`,
              JSON.stringify(remoteConfig, null, 2),
            );

            if (!remoteConfig) {
              reject(new Error('No remote config received'));
              return;
            }

            // remoteConfig is already filtered to 'configs.sessionReplay' namespace
            const namespaceConfig = remoteConfig as SessionReplayRemoteConfig;
            const samplingConfig = namespaceConfig.sr_sampling_config;
            const privacyConfig = namespaceConfig.sr_privacy_config;
            const targetingConfig = namespaceConfig.sr_targeting_config;

            const ugcFilterRules = config.interactionConfig?.ugcFilterRules;
            // This is intentionally forced to only be set through the remote config.
            config.interactionConfig = namespaceConfig.sr_interaction_config;
            if (config.interactionConfig && ugcFilterRules) {
              config.interactionConfig.ugcFilterRules = ugcFilterRules;
            }

            // This is intentionally forced to only be set through the remote config.
            config.loggingConfig = namespaceConfig.sr_logging_config;

            if (samplingConfig || privacyConfig || targetingConfig) {
              sessionReplayRemoteConfig = {};
              if (samplingConfig) {
                sessionReplayRemoteConfig.sr_sampling_config = samplingConfig;
              }
              if (privacyConfig) {
                sessionReplayRemoteConfig.sr_privacy_config = privacyConfig;
              }
              if (targetingConfig) {
                sessionReplayRemoteConfig.sr_targeting_config = targetingConfig;
              }
            }

            resolve();
          },
        );
      });
    } catch (error) {
      this.localConfig.loggerProvider.error('Failed to generate joined config: ', error);
      config.captureEnabled = false;
      return {
        localConfig: this.localConfig,
        joinedConfig: config,
        remoteConfig: undefined,
      };
    }

    if (!sessionReplayRemoteConfig) {
      return {
        localConfig: this.localConfig,
        joinedConfig: config,
        remoteConfig: sessionReplayRemoteConfig,
      };
    }

    const {
      sr_sampling_config: samplingConfig,
      sr_privacy_config: remotePrivacyConfig,
      sr_targeting_config: targetingConfig,
    } = sessionReplayRemoteConfig;
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
        maskAttributes: [
          ...new Set([...(localPrivacyConfig.maskAttributes ?? []), ...(remotePrivacyConfig.maskAttributes ?? [])]),
        ],
        urlMaskLevels: [...(remotePrivacyConfig.urlMaskLevels ?? []), ...(localPrivacyConfig.urlMaskLevels ?? [])],
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

    if (targetingConfig && Object.keys(targetingConfig).length > 0) {
      config.targetingConfig = targetingConfig;
    }

    this.localConfig.loggerProvider.debug(
      JSON.stringify({ name: 'session replay joined config', config: getDebugConfig(config) }, null, 2),
    );

    return {
      localConfig: this.localConfig,
      joinedConfig: config,
      remoteConfig: sessionReplayRemoteConfig,
    };
  }
}

export const createSessionReplayJoinedConfigGenerator = async (apiKey: string, options: SessionReplayOptions) => {
  const localConfig = new SessionReplayLocalConfig(apiKey, options);

  const remoteConfigClient = new RemoteConfigClient(
    apiKey,
    localConfig.loggerProvider,
    localConfig.serverZone,
    options.configServerUrl,
  );

  return new SessionReplayJoinedConfigGenerator(remoteConfigClient, localConfig);
};
