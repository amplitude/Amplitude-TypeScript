import { createInstance as createAnalyticsInstance } from '@amplitude/analytics-react-native';
import { Logger, LogLevel, ReactNativeOptions } from '@amplitude/analytics-core';
import { boot as bootEngagement, getPlugin } from '@amplitude/plugin-engagement-react-native';
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
  let experiment: ExperimentPlugin | undefined;
  let sessionReplay: SessionReplayPlugin | undefined;
  let engagement: ReturnType<typeof getPlugin> | undefined;
  let hasInitializedAnalytics = false;
  let initPromise: Promise<void> | undefined;

  const init = (apiKey: string, unifiedOptions?: UnifiedOptions): Promise<void> => {
    if (initPromise) {
      return initPromise;
    }

    initPromise = (async () => {
      const analyticsOptions: ReactNativeOptions = {
        ...getSharedAnalyticsOptions(unifiedOptions),
        ...unifiedOptions?.analytics,
      };
      const loggerProvider = analyticsOptions.loggerProvider ?? new Logger();
      if (analyticsOptions.loggerProvider === undefined) {
        loggerProvider.enable(analyticsOptions.logLevel ?? LogLevel.Warn);
      }
      analyticsOptions.loggerProvider = loggerProvider;

      if (hasInitializedAnalytics) {
        for (const blade of [experiment, sessionReplay, engagement]) {
          if (blade !== undefined) {
            await analyticsClient.remove(blade.name).promise;
          }
        }
        experiment = undefined;
        sessionReplay = undefined;
        engagement = undefined;
      } else {
        analyticsClient.add(libraryPlugin());
      }

      await analyticsClient.init(apiKey, analyticsOptions.userId, analyticsOptions).promise;

      if (hasInitializedAnalytics) {
        await analyticsClient.add(libraryPlugin()).promise;
      }
      hasInitializedAnalytics = true;

      experiment = experimentPlugin({
        ...getSharedExperimentOptions(unifiedOptions),
        ...unifiedOptions?.experiment,
      });
      await analyticsClient.add(experiment).promise;
      const experimentClient = experiment.experiment;
      if (experimentClient === undefined) {
        loggerProvider.debug(`${experiment.name} plugin is not initialized.`);
      } else {
        await experimentClient.start();
      }

      sessionReplay = new SessionReplayPlugin({
        ...getSharedSessionReplayOptions(unifiedOptions),
        ...unifiedOptions?.sessionReplay,
      });
      await analyticsClient.add(sessionReplay).promise;

      engagement = getPlugin({
        ...getSharedEngagementOptions(unifiedOptions),
        ...unifiedOptions?.engagement,
      });
      await analyticsClient.add(engagement).promise;
      await bootEngagement(analyticsClient.getUserId(), analyticsClient.getDeviceId());
    })().catch((error: unknown) => {
      initPromise = undefined;
      throw error;
    });

    return initPromise;
  };

  return {
    ...analyticsClient,
    init,
    experiment: () => experiment?.experiment,
    sessionReplay: () => sessionReplay,
    engagement: () => engagement,
  };
};
