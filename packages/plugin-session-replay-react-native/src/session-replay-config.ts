import { LogLevel } from '@amplitude/analytics-core';

export interface SessionReplayConfig {
  sampleRate?: number;
  enableRemoteConfig?: boolean;
  logLevel?: LogLevel;
  autoStart?: boolean;
}

export const getDefaultConfig: () => SessionReplayConfig = () => {
  return {
    sampleRate: 0,
    enableRemoteConfig: true,
    logLevel: LogLevel.Warn,
    autoStart: true,
  };
};
