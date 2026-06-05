import { LogLevel } from '@amplitude/analytics-types';

/**
 * Masking levels for sensitive content in session replay.
 *
 * Declared as a string-literal union (rather than an `enum`) to match the
 * Session Replay browser SDK and avoid the const-enum inlining pitfalls of
 * string enums under aggressive compilers.
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
   * @default 'medium'
   * @deprecated Use `privacyConfig.maskLevel` instead.
   */
  maskLevel?: MaskLevel;

  /**
   * Privacy configuration for session replay.
   * When `maskLevel` is omitted it resolves to `'medium'` at the native boundary.
   * @default {}
   */
  privacyConfig?: PrivacyConfig;

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

/**
 * Internal config shape used by the SDK after the public `SessionReplayConfig`
 * is normalized at the input boundary. The deprecated top-level `maskLevel` is
 * folded into `privacyConfig` by `normalizeConfig`, so nothing past that point
 * needs to know the deprecated field ever existed.
 *
 * Not exported from `index.tsx` on purpose — this is an implementation detail
 * of the session replay module.
 */
export type SessionReplayConfigInternal = Omit<SessionReplayConfig, 'maskLevel'>;

export const getDefaultConfig: () => Required<Omit<SessionReplayConfigInternal, 'apiKey'>> = () => {
  return {
    autoStart: true,
    deviceId: null,
    enableRemoteConfig: true,
    logLevel: LogLevel.Warn,
    optOut: false,
    // Intentionally left without a `maskLevel`: the effective default
    // (`'medium'`) is resolved once at the native boundary in `nativeConfig()`.
    // Baking it in here would make the deprecated top-level `maskLevel`
    // unreachable through the `?? 'medium'` fallback (silent privacy downgrade).
    privacyConfig: {},
    sampleRate: 0,
    serverZone: 'US',
    sessionId: -1,
  };
};
export { LogLevel };
