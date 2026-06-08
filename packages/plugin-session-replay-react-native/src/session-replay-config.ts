import { LogLevel } from '@amplitude/analytics-types';

/**
 * Masking levels for sensitive content in session replay.
 *
 * Declared as a string-literal union (rather than an `enum`) to match the
 * Session Replay browser SDK and avoid the const-enum inlining pitfalls of
 * string enums under aggressive compilers. Kept structurally identical to the
 * standalone `@amplitude/session-replay-react-native` SDK's `MaskLevel` so the
 * two packages stay in lockstep without coupling the plugin's runtime to the
 * standalone native module.
 *
 * - `light`: mask only inputs that are always sensitive (password, etc.).
 * - `medium`: mask all `<TextInput>` fields.
 * - `conservative`: mask all `<TextInput>` fields and all `<Text>` content.
 */
export type MaskLevel = 'light' | 'medium' | 'conservative';

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
   * Privacy configuration for session replay.
   * When `maskLevel` is omitted it resolves to `'medium'` at the native boundary.
   * @default {}
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
    // Intentionally left without a `maskLevel`: the effective default
    // (`'medium'`) is resolved once at the native boundary in `setup()`.
    // Baking it in here would make a partial user `privacyConfig` (e.g. `{}`)
    // unable to fall through to the `?? 'medium'` resolution.
    privacyConfig: {},
    sampleRate: 0,
  };
};
export { LogLevel };
