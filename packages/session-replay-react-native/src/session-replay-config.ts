import { type Logger, LogLevel } from '@amplitude/analytics-types';
import { SessionReplayLogger } from './logger';

export enum MaskLevel {
  Light = 'light',
  Medium = 'medium',
  Conservative = 'conservative',
}

export interface SessionReplayConfig {
  apiKey: string;
  autoStart?: boolean;
  deviceId?: string | null;
  enableRemoteConfig?: boolean;
  logLevel?: LogLevel;
  maskLevel?: MaskLevel;
  optOut?: boolean;
  sampleRate?: number;
  serverZone?: 'EU' | 'US';
  sessionId?: number;
  logger?: Logger;
}

export const getDefaultConfig: () => Required<Omit<SessionReplayConfig, 'apiKey'>> = () => {
  return {
    autoStart: true,
    deviceId: null,
    enableRemoteConfig: true,
    logLevel: LogLevel.Warn,
    maskLevel: MaskLevel.Medium,
    optOut: false,
    sampleRate: 0,
    serverZone: 'US',
    sessionId: -1,
    logger: new SessionReplayLogger(),
  };
};
