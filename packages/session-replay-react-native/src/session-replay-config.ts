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

/**
 * Configuration for Session Replay React Native SDK
 */
export interface SessionReplayConfig {
  /**
   * Your Amplitude API key
   * @required
   */
  apiKey: string;

  /**
   * Whether to automatically start recording when the SDK is initialized
   * @default true
   */
  autoStart?: boolean;

  /**
   * Device identifier that matches the device ID sent with Amplitude events
   * Must match the Device ID passed as event properties to Amplitude
   * @default null
   */
  deviceId?: string | null;

  /**
   * Whether to enable remote configuration
   * @default true
   */
  enableRemoteConfig?: boolean;

  /**
   * Log level for the SDK
   * @default LogLevel.Warn
   */
  logLevel?: LogLevel;

  /**
   * Level of masking applied to sensitive content
   * @default MaskLevel.Medium
   */
  maskLevel?: MaskLevel;

  /**
   * Whether to opt out of session replay collection
   * @default false
   */
  optOut?: boolean;

  /**
   * Sample rate for session replay (0.0 to 1.0)
   * Determines what percentage of sessions will be recorded
   * @default 0
   */
  sampleRate?: number;

  /**
   * Server zone for data processing
   * @default 'US'
   * @review: Verify EU server zone compliance and data residency requirements
   */
  serverZone?: 'EU' | 'US';

  /**
   * Session identifier that matches the session ID sent with Amplitude events
   * Must match the Session ID passed as event properties to Amplitude
   * @default -1
   */
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
