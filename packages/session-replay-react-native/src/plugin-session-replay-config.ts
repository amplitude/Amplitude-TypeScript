import { LogLevel } from '@amplitude/analytics-types';

import type { PrivacyConfig } from './session-replay-config';

/**
 * Configuration for Session Replay React Native Plugin
 */
export interface SessionReplayPluginConfig {
  /**
   * Sample rate for session replay (0.0 to 1.0)
   * Determines what percentage of sessions will be recorded
   * @default 0
   */
  sampleRate?: number;

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
   * Whether to automatically start recording when the plugin is added
   * @default true
   */
  autoStart?: boolean;

  /**
   * Privacy configuration for session replay, including the masking level
   * applied to sensitive content. When `maskLevel` is omitted it resolves to
   * `'medium'` at the native boundary.
   * @default {}
   */
  privacyConfig?: PrivacyConfig;
}

export const getDefaultSessionReplayPluginConfig: () => Required<SessionReplayPluginConfig> = () => {
  return {
    sampleRate: 0,
    enableRemoteConfig: true,
    logLevel: LogLevel.Warn,
    autoStart: true,
    // Intentionally left without a `maskLevel`: the effective default
    // (`'medium'`) is resolved once at the native boundary by `nativeConfig()`,
    // mirroring `getDefaultConfig()` in session-replay-config.ts.
    privacyConfig: {},
  };
};
