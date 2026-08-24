import type { LogLevel, ReactNativeClient, ReactNativeOptions } from '@amplitude/analytics-core';
import type { getPlugin } from '@amplitude/plugin-engagement-react-native';
import type { ExperimentPluginConfig, IExperimentClient } from '@amplitude/plugin-experiment-react-native';
import type { SessionReplayConfig, SessionReplayPlugin } from '@amplitude/plugin-session-replay-react-native';

export type EngagementOptions = NonNullable<Parameters<typeof getPlugin>[0]>;
export type EngagementPlugin = ReturnType<typeof getPlugin>;

export interface UnifiedSharedOptions {
  /** Data residency zone used by every blade SDK. */
  serverZone?: 'US' | 'EU';

  /** Named Analytics instance shared with SDKs that integrate through the Analytics connector. */
  instanceName?: string;

  /** Log verbosity translated to each blade SDK's representation. */
  logLevel?: LogLevel;
}

export type UnifiedOptions = UnifiedSharedOptions & {
  /** Analytics-specific options. These override shared options when both are set. */
  analytics?: ReactNativeOptions;

  /** Session Replay-specific options. These override shared options when both are set. */
  sessionReplay?: SessionReplayConfig;

  /** Experiment-specific options. These override shared options when both are set. */
  experiment?: ExperimentPluginConfig;

  /** Guides and Surveys-specific options. These override shared options when both are set. */
  engagement?: EngagementOptions;
};

export interface UnifiedClient extends Omit<ReactNativeClient, 'init'> {
  /** Initialize Analytics, Experiment, Session Replay, and Guides and Surveys. */
  init(apiKey: string, unifiedOptions?: UnifiedOptions): Promise<void>;

  /** Return the Experiment client after init() has installed its plugin. */
  experiment(): IExperimentClient | undefined;

  /** Return the Session Replay plugin after init() has installed it. */
  sessionReplay(): SessionReplayPlugin | undefined;

  /** Return the Guides and Surveys plugin after init() has installed it. */
  engagement(): EngagementPlugin | undefined;
}
