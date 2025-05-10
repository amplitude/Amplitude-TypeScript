import { LogLevel } from '@amplitude/analytics-types';

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
