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

export interface PrivacyConfig {
  maskLevel?: MaskLevel;
}

/**
 * Configuration for the Session Replay React Native plugin.
 *
 * Unlike the standalone `@amplitude/session-replay-react-native` SDK, the
 * plugin auto-sources `apiKey`, `deviceId`, `sessionId`, and `serverZone`
 * from the analytics client's `ReactNativeConfig` at `setup()` time, so
 * those fields are intentionally absent from the public plugin config.
 * The plugin also never shipped a deprecated top-level `maskLevel`, so no
 * input-boundary normalization (and no `SessionReplayConfigInternal` alias)
 * is needed here.
 */
export interface SessionReplayConfig {
  /**
   * Whether to automatically start recording when the plugin is added
   * @default true
   */
  autoStart?: boolean;

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
   * Privacy configuration for session replay
   * @default { maskLevel: MaskLevel.Medium }
   */
  privacyConfig?: PrivacyConfig;

  /**
   * Sample rate for session replay (0.0 to 1.0)
   * Determines what percentage of sessions will be recorded
   * @default 0
   */
  sampleRate?: number;
}

export const getDefaultConfig: () => Required<SessionReplayConfig> = () => {
  return {
    autoStart: true,
    enableRemoteConfig: true,
    logLevel: LogLevel.Warn,
    privacyConfig: { maskLevel: MaskLevel.Medium },
    sampleRate: 0,
  };
};
export { LogLevel };
