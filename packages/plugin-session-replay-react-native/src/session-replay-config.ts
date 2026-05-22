import { LogLevel } from '@amplitude/analytics-types';

/**
 * Masking levels for sensitive content in session replay
 */
export enum MaskLevel {
  /**
   * Light masking - minimal content is masked
   */
  Light = 'light',
  /**
   * Medium masking - balanced approach to content masking
   */
  Medium = 'medium',
  /**
   * Conservative masking - maximum content masking for privacy
   */
  Conservative = 'conservative',
}

export interface SessionReplayConfig {
  sampleRate?: number;
  enableRemoteConfig?: boolean;
  logLevel?: LogLevel;
  autoStart?: boolean;
  maskLevel?: MaskLevel;
}

export const getDefaultConfig: () => SessionReplayConfig = () => {
  return {
    sampleRate: 0,
    enableRemoteConfig: true,
    logLevel: LogLevel.Warn,
    autoStart: true,
    maskLevel: MaskLevel.Medium,
  };
};
