import { AmplitudeBrowser } from '@amplitude/analytics-browser';
import {
  AmplitudeSessionReplay,
  SessionReplayOptions,
  sessionReplayPlugin,
  SessionReplayPlugin,
} from '@amplitude/plugin-session-replay-browser';
import {
  IExperimentClient,
  ExperimentConfig,
  ExperimentPlugin,
  experimentPlugin,
} from '@amplitude/plugin-experiment-browser';
import { BrowserClient, BrowserOptions, LogLevel } from '@amplitude/analytics-core';

export interface UnifiedSharedOptions {
  serverZone?: 'US' | 'EU';
  instanceName?: string;
  /**
   * If logLevel is debug:
   * - analytics.config.logLevel = debug
   * - sr.config.logLevel = debug
   * - sr.config.debugMode = true
   * - experiment.config.debug = true
   */
  logLevel: LogLevel;
}

export type UnifiedOptions = UnifiedSharedOptions & {
  analytics?: BrowserOptions;
  sr?: Omit<SessionReplayOptions, keyof UnifiedSharedOptions>;
  experiment?: Omit<ExperimentConfig, keyof UnifiedSharedOptions>;
};

export interface UnifiedClient extends BrowserClient {
  initAll(apiKey: string, unifiedOptions?: UnifiedOptions): Promise<void>;
  sr: AmplitudeSessionReplay;
  experiment: IExperimentClient;
}

export class AmplitudeUnified extends AmplitudeBrowser implements UnifiedClient {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  experiment: IExperimentClient;
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  sr: AmplitudeSessionReplay;

  /**
   * Initialize SDKs with configuration options.
   * Note that shared configuration in unifiedOptions will override the value in analyticsOptions.
   *
   * For example, the serverZone will be 'EU' for all SDKs.
   * ```
   * init('API_KEY', {serverZone: 'US'}, {serverZone: 'EU'});
   * ```
   *
   * @param apiKey Amplitude API key.
   * @param analyticsOptions Analytics configuration options. Refer to {@link https://amplitude.com/docs/sdks/analytics/browser/browser-sdk-2#configure-the-sdk here} for more info.
   * @param unifiedOptions Shared configuration for all SDKs and for blade SDKs.
   */
  async initAll(apiKey: string, unifiedOptions?: UnifiedOptions) {
    const sharedOptions = {
      serverZone: unifiedOptions?.serverZone,
      instanceName: unifiedOptions?.instanceName,
      logLevel: unifiedOptions?.logLevel,
    };

    await super.init(apiKey, { ...unifiedOptions?.analytics, ...sharedOptions }).promise;

    await super.add(
      sessionReplayPlugin({
        ...unifiedOptions?.sr,
        ...sharedOptions,
        debugMode: sharedOptions.logLevel === LogLevel.Debug ? true : false,
      }),
    ).promise;
    await super.add(
      experimentPlugin({
        ...unifiedOptions?.experiment,
        ...sharedOptions,
        debug: sharedOptions.logLevel === LogLevel.Debug ? true : false,
      }),
    ).promise;

    const srPlugin = super.plugin(SessionReplayPlugin.pluginName);
    if (srPlugin === undefined) {
      this.config.loggerProvider.debug('SR plugin is not found.');
    } else {
      this.sr = (srPlugin as SessionReplayPlugin).sr;
    }

    const expPlugin = super.plugin(ExperimentPlugin.pluginName);
    if (expPlugin === undefined) {
      this.config.loggerProvider.debug('Experiment plugin is not found.');
    } else {
      this.experiment = (expPlugin as ExperimentPlugin).experiment;
    }
  }

  init(apiKey = '', userIdOrOptions?: string | BrowserOptions, maybeOptions?: BrowserOptions) {
    const res = super.init(apiKey, userIdOrOptions, maybeOptions);
    this.config.loggerProvider.debug(
      'Only analytics SDK is initialized. Use initAll() instead to initialize all blade SDKs.',
    );
    return res;
  }
}
