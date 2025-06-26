import { LogLevel } from '@amplitude/analytics-types';

export interface SessionReplayPluginConfig {
  sampleRate?: number;
  enableRemoteConfig?: boolean;
  logLevel?: LogLevel;
  autoStart?: boolean;
}

export const getDefaultSessionReplayPluginConfig: () => SessionReplayPluginConfig = () => {
  return {
    sampleRate: 0,
    enableRemoteConfig: true,
    logLevel: LogLevel.Warn,
    autoStart: true,
  };
};
