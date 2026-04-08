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
import { InitOptions, plugin as EngagementPlugin } from '@amplitude/engagement-browser';
import { BrowserClient, BrowserOptions } from '@amplitude/analytics-core';
import { libraryPlugin } from './library';

export interface UnifiedSharedOptions {
  serverZone?: 'US' | 'EU';
  instanceName?: string;
}

export type UnifiedOptions = UnifiedSharedOptions & {
  analytics?: BrowserOptions;
  sessionReplay?: Omit<SessionReplayOptions, keyof UnifiedSharedOptions>;
  experiment?: Omit<ExperimentPluginConfig, keyof UnifiedSharedOptions>;
  engagement?: Omit<InitOptions, keyof UnifiedSharedOptions>;
};

type EngagementSDK = {
  boot?: (...args: unknown[]) => unknown;
  shutdown?: (...args: unknown[]) => unknown;
  [key: string]: unknown;
};

export type EngagementSDKPlugin = Omit<EngagementSDK, 'boot' | 'shutdown'>;

export interface UnifiedClient extends BrowserClient {
  initAll(apiKey: string, unifiedOptions?: UnifiedOptions): Promise<void>;
  sessionReplay(): AmplitudeSessionReplay;
  experiment(): IExperimentClient | undefined;
  engagement(): EngagementSDKPlugin | undefined;
}

export class AmplitudeUnified extends AmplitudeBrowser implements UnifiedClient {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private _sessionReplay: AmplitudeSessionReplay;
  private _initAllPromise?: Promise<void>;

  sessionReplay(): AmplitudeSessionReplay {
    return this._sessionReplay;
  }

  experiment(): IExperimentClient | undefined {
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

  engagement(): EngagementSDKPlugin | undefined {
    // eslint-disable-next-line no-restricted-globals
    return (window as Window & { engagement?: EngagementSDKPlugin }).engagement as EngagementSDKPlugin;
  }

  /**
   * Initialize SDKs with configuration options.
   *
   * @param apiKey Amplitude API key.
   * @param analyticsOptions Analytics configuration options. Refer to {@link https://amplitude.com/docs/sdks/analytics/browser/browser-sdk-2#configure-the-sdk here} for more info.
   * @param unifiedOptions Shared configuration for all SDKs and for blade SDKs.
   */
  async initAll(apiKey: string, unifiedOptions?: UnifiedOptions) {
    if (this._initAllPromise) {
      return this._initAllPromise;
    }

    this._initAllPromise = (async () => {
      const sharedOptions = {
        serverZone: unifiedOptions?.serverZone,
        instanceName: unifiedOptions?.instanceName,
      };

      super.add(libraryPlugin());

      await super.init(apiKey, { ...unifiedOptions?.analytics, ...sharedOptions }).promise;

      await super.add(sessionReplayPlugin({ ...unifiedOptions?.sessionReplay, ...sharedOptions })).promise;

      await super.add(experimentPlugin({ ...unifiedOptions?.experiment, ...sharedOptions })).promise;

      const srPlugin = this.plugin(SessionReplayPlugin.pluginName);
      if (srPlugin === undefined) {
        this.config.loggerProvider.debug(`${SessionReplayPlugin.pluginName} plugin is not found.`);
      } else {
        this._sessionReplay = (srPlugin as SessionReplayPlugin).sessionReplay;
      }

      await super.add(
        EngagementPlugin({
          ...unifiedOptions?.engagement,
          ...sharedOptions,
        }),
      ).promise;
    })().finally(() => {
      this._initAllPromise = undefined;
    });

    return this._initAllPromise;
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
