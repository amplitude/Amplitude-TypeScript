import { createInstance as createAnalyticsInstance } from '@amplitude/analytics-react-native';
import { LogLevel, ReactNativeOptions } from '@amplitude/analytics-core';
import { getPlugin } from '@amplitude/plugin-engagement-react-native';
import { experimentPlugin } from '@amplitude/plugin-experiment-react-native';
import type { ExperimentPlugin, ExperimentPluginConfig } from '@amplitude/plugin-experiment-react-native';
import { SessionReplayConfig, SessionReplayPlugin } from '@amplitude/plugin-session-replay-react-native';
import { libraryPlugin } from './library';
import type { EngagementOptions, UnifiedClient, UnifiedOptions } from './types';

type EngagementLogLevel = NonNullable<EngagementOptions['logLevel']>;

const toEngagementLogLevel = (logLevel: LogLevel): EngagementLogLevel => {
  switch (logLevel) {
    case LogLevel.None:
      return 'none';
    case LogLevel.Error:
      return 'error';
    case LogLevel.Warn:
      return 'warn';
    case LogLevel.Verbose:
      return 'verbose';
    case LogLevel.Debug:
      return 'debug';
  }
};

const getSharedAnalyticsOptions = (options?: UnifiedOptions): ReactNativeOptions => ({
  ...(options?.serverZone === undefined ? {} : { serverZone: options.serverZone }),
  ...(options?.instanceName === undefined ? {} : { instanceName: options.instanceName }),
  ...(options?.logLevel === undefined ? {} : { logLevel: options.logLevel }),
});

const getSharedExperimentOptions = (options?: UnifiedOptions): ExperimentPluginConfig => ({
  ...(options?.serverZone === undefined ? {} : { serverZone: options.serverZone }),
  ...(options?.instanceName === undefined ? {} : { instanceName: options.instanceName }),
});

const getSharedSessionReplayOptions = (options?: UnifiedOptions): SessionReplayConfig => ({
  ...(options?.logLevel === undefined ? {} : { logLevel: options.logLevel as SessionReplayConfig['logLevel'] }),
});

const getSharedEngagementOptions = (options?: UnifiedOptions): EngagementOptions => ({
  ...(options?.serverZone === undefined ? {} : { serverZone: options.serverZone }),
  ...(options?.logLevel === undefined ? {} : { logLevel: toEngagementLogLevel(options.logLevel) }),
});

export const createInstance = (): UnifiedClient => {
  const analyticsClient = createAnalyticsInstance();
  let activeExperiment: ExperimentPlugin | undefined;
  let activeSessionReplay: SessionReplayPlugin | undefined;
  let activeEngagement: ReturnType<typeof getPlugin> | undefined;
  let hasInitialized = false;
  let initAllPromise: Promise<void> | undefined;

  const initAll = async (apiKey: string, unifiedOptions?: UnifiedOptions): Promise<void> => {
    if (initAllPromise) {
      return initAllPromise;
    }

    initAllPromise = (async () => {
      const analyticsOptions: ReactNativeOptions = {
        ...getSharedAnalyticsOptions(unifiedOptions),
        ...unifiedOptions?.analytics,
      };

      if (!hasInitialized) {
        analyticsClient.add(libraryPlugin());
      }

      await analyticsClient.init(apiKey, analyticsOptions.userId, analyticsOptions).promise;

      if (hasInitialized) {
        await analyticsClient.add(libraryPlugin()).promise;
      }
      hasInitialized = true;

      const experiment =
        activeExperiment ??
        experimentPlugin({
          ...getSharedExperimentOptions(unifiedOptions),
          ...unifiedOptions?.experiment,
        });
      await analyticsClient.add(experiment).promise;
      activeExperiment = experiment;

      const sessionReplay =
        activeSessionReplay ??
        new SessionReplayPlugin({
          ...getSharedSessionReplayOptions(unifiedOptions),
          ...unifiedOptions?.sessionReplay,
        });
      await analyticsClient.add(sessionReplay).promise;
      activeSessionReplay = sessionReplay;

      const engagement =
        activeEngagement ??
        getPlugin({
          ...getSharedEngagementOptions(unifiedOptions),
          ...unifiedOptions?.engagement,
        });
      await analyticsClient.add(engagement).promise;
      activeEngagement = engagement;
    })().finally(() => {
      initAllPromise = undefined;
    });

    return initAllPromise;
  };

  return {
    ...analyticsClient,
    initAll,
    experiment: () => activeExperiment?.experiment,
    sessionReplay: () => activeSessionReplay,
    engagement: () => activeEngagement,
  };
};
