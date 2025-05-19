import { AmplitudeBrowser } from '@amplitude/analytics-browser';
import {
  AmplitudeSessionReplay,
  SessionReplayOptions,
  sessionReplayPlugin,
  SessionReplayPlugin,
} from '@amplitude/plugin-session-replay-browser';
import {
  IExperimentClient,
  ExperimentPluginConfig,
  ExperimentPlugin,
  experimentPlugin,
} from '@amplitude/plugin-experiment-browser';
import { BrowserClient, BrowserOptions } from '@amplitude/analytics-core';
import { libraryPlugin } from './library';

export interface UnifiedSharedOptions {
  serverZone?: 'US' | 'EU';
  instanceName?: string;
}

export type UnifiedOptions = UnifiedSharedOptions & {
  analytics?: BrowserOptions;
  sr?: Omit<SessionReplayOptions, keyof UnifiedSharedOptions>;
  experiment?: Omit<ExperimentPluginConfig, keyof UnifiedSharedOptions>;
};

export interface UnifiedClient extends BrowserClient {
  initAll(apiKey: string, unifiedOptions?: UnifiedOptions): Promise<void>;
  sr: AmplitudeSessionReplay;
  experiment: IExperimentClient | undefined;
}

export class AmplitudeUnified extends AmplitudeBrowser implements UnifiedClient {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  sr: AmplitudeSessionReplay;

  get experiment(): IExperimentClient | undefined {
    // Return when init() or initAll() is not called
    if (this.config === undefined) {
      return undefined;
    }

    const expPlugins = this.plugins(ExperimentPlugin);
    if (expPlugins.length === 0) {
      this.config.loggerProvider.debug(`${ExperimentPlugin.pluginName} plugin is not found.`);
      return undefined;
    } else if (expPlugins.length === 1) {
      return expPlugins[0].experiment;
    } else {
      this.config.loggerProvider.debug(`Multiple instances of ${ExperimentPlugin.pluginName} are found.`);
      return undefined;
    }
  }

  /**
   * Initialize SDKs with configuration options.
   *
   * @param apiKey Amplitude API key.
   * @param analyticsOptions Analytics configuration options. Refer to {@link https://amplitude.com/docs/sdks/analytics/browser/browser-sdk-2#configure-the-sdk here} for more info.
   * @param unifiedOptions Shared configuration for all SDKs and for blade SDKs.
   */
  async initAll(apiKey: string, unifiedOptions?: UnifiedOptions) {
    const sharedOptions = {
      serverZone: unifiedOptions?.serverZone,
      instanceName: unifiedOptions?.instanceName,
    };

    super.add(libraryPlugin());
    await super.init(apiKey, { ...unifiedOptions?.analytics, ...sharedOptions }).promise;

    await super.add(sessionReplayPlugin({ ...unifiedOptions?.sr, ...sharedOptions })).promise;

    await super.add(experimentPlugin({ ...unifiedOptions?.experiment, ...sharedOptions })).promise;

    const srPlugin = this.plugin(SessionReplayPlugin.pluginName);
    if (srPlugin === undefined) {
      this.config.loggerProvider.debug(`${SessionReplayPlugin.pluginName} plugin is not found.`);
    } else {
      this.sr = (srPlugin as SessionReplayPlugin).sr;
    }
  }

  /**
   * Only analytics SDK is initialized. Use initAll() instead to initialize all blade SDKs.
   */
  /* istanbul ignore next */
  init(apiKey = '', userIdOrOptions?: string | BrowserOptions, maybeOptions?: BrowserOptions) {
    const res = super.init(apiKey, userIdOrOptions, maybeOptions);
    return res;
  }
}
