import { type Logger, LogLevel, type ServerZoneType } from '@amplitude/analytics-types';

export enum MaskLevel {
  Light = 'light',
  Medium = 'medium',
  Conservative = 'conservative',
}

export interface SessionReplayConfig {
  apiKey: string;
  autoStart?: boolean;
  deviceId?: string;
  enableRemoteConfig?: boolean;
  logLevel?: LogLevel;
  maskLevel?: MaskLevel;
  optOut?: boolean;
  sampleRate?: number;
  serverZone?: ServerZoneType;
  sessionId?: number;
  logger?: Logger;
}

export const getDefaultConfig: () => Required<Omit<SessionReplayConfig, 'apiKey'>> = () => {
  return {
    autoStart: true,
    deviceId: '',
    enableRemoteConfig: true,
    logLevel: LogLevel.Warn,
    maskLevel: MaskLevel.Medium,
    optOut: false,
    sampleRate: 0,
    serverZone: 'US' as ServerZoneType,
    sessionId: 0,
    // use logger from analytics-core
    logger: console as unknown as Logger,
  };
};
