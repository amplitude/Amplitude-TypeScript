import { createInstance as createAnalyticsInstance } from '@amplitude/analytics-react-native';
import { ILogger, Logger, LogLevel, ReactNativeOptions } from '@amplitude/analytics-core';
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

const logInitializationError = (loggerProvider: ILogger, blade: string, error: unknown): void => {
  try {
    loggerProvider.error(`Failed to initialize ${blade}.`, error);
  } catch {
    // A customer-provided logger must not make a public SDK API throw.
  }
};

/**
 * Creates a unified client.
 *
 * Multiple unified clients are not isolated because the React Native Engagement plugin is a process-wide singleton.
 * All clients share the first initialized Engagement plugin and its configuration.
 */
export const createInstance = (): UnifiedClient => {
  const analyticsClient = createAnalyticsInstance();
  let experiment: ExperimentPlugin | undefined;
  let sessionReplay: SessionReplayPlugin | undefined;
  let initPromise: Promise<void> | undefined;

  const init = (apiKey: string, unifiedOptions?: UnifiedOptions): Promise<void> => {
    if (initPromise) {
      return initPromise;
    }

    initPromise = (async () => {
      let loggerProvider: ILogger = new Logger();

      try {
        const analyticsOptions: ReactNativeOptions = {
          ...getSharedAnalyticsOptions(unifiedOptions),
          ...unifiedOptions?.analytics,
        };
        loggerProvider = analyticsOptions.loggerProvider ?? loggerProvider;
        if (analyticsOptions.loggerProvider === undefined) {
          loggerProvider.enable(analyticsOptions.logLevel ?? LogLevel.Warn);
        }
        analyticsOptions.loggerProvider = loggerProvider;

        analyticsClient.add(libraryPlugin());
        await analyticsClient.init(apiKey, analyticsOptions.userId, analyticsOptions).promise;
      } catch (error) {
        logInitializationError(loggerProvider, 'Analytics', error);
        return;
      }

      try {
        const initializedExperiment = experimentPlugin({
          ...getSharedExperimentOptions(unifiedOptions),
          ...unifiedOptions?.experiment,
        });
        await analyticsClient.add(initializedExperiment).promise;
        experiment = initializedExperiment;

        const experimentClient = initializedExperiment.experiment;
        if (experimentClient === undefined) {
          loggerProvider.debug(`${initializedExperiment.name} plugin is not initialized.`);
        } else {
          await experimentClient.start();
        }
      } catch (error) {
        logInitializationError(loggerProvider, 'Experiment', error);
      }

      try {
        const initializedSessionReplay = new SessionReplayPlugin({
          ...getSharedSessionReplayOptions(unifiedOptions),
          ...unifiedOptions?.sessionReplay,
        });
        await analyticsClient.add(initializedSessionReplay).promise;
        sessionReplay = initializedSessionReplay;
      } catch (error) {
        logInitializationError(loggerProvider, 'Session Replay', error);
      }

      try {
        // Engagement intentionally returns a process-wide singleton. Independent unified client instances are unsupported.
        const engagement = getPlugin({
          ...getSharedEngagementOptions(unifiedOptions),
          ...unifiedOptions?.engagement,
        });
        await analyticsClient.add(engagement).promise;
        await bootEngagement(analyticsClient.getUserId(), analyticsClient.getDeviceId());
      } catch (error) {
        logInitializationError(loggerProvider, 'Guides and Surveys', error);
      }
    })();

    return initPromise;
  };

  return {
    ...analyticsClient,
    init,
    experiment: () => experiment?.experiment,
    sessionReplay: () => sessionReplay,
  };
};
