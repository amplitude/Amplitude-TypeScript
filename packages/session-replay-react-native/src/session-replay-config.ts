import { LogLevel } from '@amplitude/analytics-types';

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
  };
};
export { LogLevel };
