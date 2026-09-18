// @refresh reset

import { NativeSessionReplay, type NativeSessionReplayConfig } from './native-module';
import { getDefaultConfig, SessionReplayConfig, SessionReplayConfigInternal } from './session-replay-config';
import { createSessionReplayLogger } from './logger';
import { VERSION } from './version';

type ResolvedSessionReplayConfig = Required<Omit<SessionReplayConfigInternal, 'customSessionId'>> &
  Pick<SessionReplayConfigInternal, 'customSessionId'>;

/**
 * Translates the public `SessionReplayConfig` into the internal shape by
 * folding the deprecated top-level `maskLevel` into `privacyConfig`. After
 * this step, the rest of the SDK only ever sees `privacyConfig`.
 *
 * `privacyConfig` wins when explicitly set; otherwise translate the
 * deprecated `maskLevel`; otherwise leave the field out so the default
 * supplied by `getDefaultConfig()` survives the shallow merge in `init()`.
 */
function normalizeConfig(config: SessionReplayConfig): SessionReplayConfigInternal {
  const { maskLevel, privacyConfig, ...rest } = config;
  if (privacyConfig !== undefined) {
    return { ...rest, privacyConfig };
  }
  if (maskLevel !== undefined) {
    return { ...rest, privacyConfig: { maskLevel } };
  }
  return rest;
}

let isInitialized = false;
let logger = createSessionReplayLogger();

// The RN SDK drives the native layer exclusively through the customSessionId
// path, so the native side no longer stores a numeric session id. Track it here
// to preserve the public `getSessionId()` contract: it returns the numeric the
// consumer set, or `-1` while a string custom session id is active.
let numericSessionId = -1;
let customSessionIdActive = false;

/**
 * Configure the SDK. Call `start()` explicitly to begin collecting replays.
 * This function must be called before any other session replay operations.
 *
 * @param config - Configuration object containing API key, device ID, session ID, and other options
 * @returns Promise that resolves when initialization is complete. Native setup
 * failures are logged and do not reject the promise.
 *
 * @example
 * ```typescript
 * await init({
 *   apiKey: 'YOUR_API_KEY',
 *   deviceId: 'user-device-id',
 *   sessionId: Date.now(),
 *   sampleRate: 0.1
 * });
 * ```
 */
export async function init(config: SessionReplayConfig): Promise<void> {
  if (isInitialized) {
    logger.warn('SessionReplay is already initialized');
    return;
  }

  // TODO: this is a shallow merge — a user-supplied `privacyConfig` replaces
  // the default object wholesale. That's fine while `PrivacyConfig` only
  // carries `maskLevel`, but if it ever grows more fields a deeper merge will
  // be needed so partial user configs don't drop defaults.
  const resolvedConfig: ResolvedSessionReplayConfig = {
    ...getDefaultConfig(),
    ...normalizeConfig(config),
  };

  logger.setLogLevel(resolvedConfig.logLevel);
  logger.log(`initializing @amplitude/session-replay-react-native version: ${VERSION} with config: `, resolvedConfig);

  try {
    await NativeSessionReplay.setup(nativeConfig(resolvedConfig));
    logger.log('SessionReplay initialized');
    // Seed the tracked numeric session id from config. When a string custom id
    // is supplied it takes precedence and `getSessionId()` reports `-1`.
    numericSessionId = resolvedConfig.sessionId;
    customSessionIdActive = resolvedConfig.customSessionId != null && resolvedConfig.customSessionId !== '';
    isInitialized = true;
  } catch (error) {
    logger.error('Error initializing SessionReplay', error);
  }
}

/**
 * Call whenever the session ID changes.
 * The Session ID you pass to the SDK must match the Session ID sent as event properties to Amplitude.
 *
 * Under the hood the numeric session id is mapped onto the native custom session
 * id (as its string form) — the RN SDK never drives the native numeric session
 * id. `getSessionId()` still returns the numeric value you passed here.
 *
 * @param sessionId - The new session identifier number
 * @returns Promise that resolves when the session ID is updated
 *
 * @example
 * ```typescript
 * await setSessionId(Date.now());
 * ```
 */
export async function setSessionId(sessionId: number): Promise<void> {
  if (!isInitialized) {
    logger.warn('SessionReplay is not initialized');
    return;
  }
  await NativeSessionReplay.setCustomSessionId(String(sessionId));
  numericSessionId = sessionId;
  customSessionIdActive = false;
}

/**
 * Call whenever the alphanumeric session ID changes.
 * The value must match the Session ID sent as event properties to Amplitude.
 * While a custom session ID is active, `getSessionId()` returns `-1`.
 *
 * @param customSessionId - The new alphanumeric session identifier
 */
export async function setCustomSessionId(customSessionId: string): Promise<void> {
  if (!isInitialized) {
    logger.warn('SessionReplay is not initialized');
    return;
  }
  await NativeSessionReplay.setCustomSessionId(customSessionId);
  customSessionIdActive = true;
}

/**
 * Get the current alphanumeric session identifier from the session replay SDK.
 *
 * @returns Promise that resolves to the active custom session ID, or null if not initialized
 */
export async function getCustomSessionId(): Promise<string | null> {
  if (!isInitialized) {
    logger.warn('SessionReplay is not initialized');
    return null;
  }
  return await NativeSessionReplay.getCustomSessionId();
}

/**
 * Update the device ID used for session replay tracking.
 * The Device ID you pass to the SDK must match the Device ID sent as event properties to Amplitude.
 *
 * @param deviceId - The device identifier string, or null to clear the device ID
 * @returns Promise that resolves when the device ID is updated
 *
 * @example
 * ```typescript
 * await setDeviceId('user-device-id');
 * // or clear device ID
 * await setDeviceId(null);
 * ```
 */
export async function setDeviceId(deviceId: string | null): Promise<void> {
  if (!isInitialized) {
    logger.warn('SessionReplay is not initialized');
    return;
  }
  await NativeSessionReplay.setDeviceId(deviceId);
}

/**
 * Get the current session identifier from the session replay SDK.
 *
 * @returns Promise that resolves to the current session ID number, or null if not initialized
 *
 * @example
 * ```typescript
 * const sessionId = await getSessionId();
 * if (sessionId !== null) {
 *   console.log('Current session ID:', sessionId);
 * }
 * ```
 */
export async function getSessionId(): Promise<number | null> {
  if (!isInitialized) {
    logger.warn('SessionReplay is not initialized');
    return null;
  }
  // The native layer only tracks the custom session id now, so derive the
  // numeric contract from JS state: the numeric the consumer set, or `-1` while
  // a string custom session id is active.
  return customSessionIdActive ? -1 : numericSessionId;
}

/**
 * Flush any pending session replay data to the server.
 * Forces immediate upload of recorded session data that may be buffered locally.
 *
 * @returns Promise that resolves when the flush operation is complete
 *
 * @example
 * ```typescript
 * // Flush data before app termination
 * await flush();
 * ```
 */
export async function flush(): Promise<void> {
  if (!isInitialized) {
    logger.warn('SessionReplay is not initialized');
    return;
  }
  await NativeSessionReplay.flush();
}

/**
 * Start session replay recording.
 * Begins capturing user interactions and screen content for replay.
 *
 * @returns Promise that resolves when recording starts
 *
 * @example
 * ```typescript
 * // Recording starts only after this explicit call.
 * await start();
 * ```
 */
export async function start(): Promise<void> {
  if (!isInitialized) {
    logger.warn('SessionReplay is not initialized');
    return;
  }
  await NativeSessionReplay.start();
}

/**
 * Stop session replay recording.
 * Ends the current recording session and processes any captured data.
 *
 * @returns Promise that resolves when recording stops
 *
 * @example
 * ```typescript
 * // Stop recording when user logs out or app goes to background
 * await stop();
 * ```
 */
export async function stop(): Promise<void> {
  if (!isInitialized) {
    logger.warn('SessionReplay is not initialized');
    return;
  }
  await NativeSessionReplay.stop();
}

/**
 * Update whether session replay collection is disabled for the current user.
 *
 * @param optOut - Whether to opt out of session replay collection
 * @returns Promise that resolves when the opt-out state is updated
 */
export async function setOptOut(optOut: boolean): Promise<void> {
  if (!isInitialized) {
    logger.warn('SessionReplay is not initialized');
    return;
  }
  await NativeSessionReplay.setOptOut(optOut);
}

/**
 * Shut down the native SDK and clear all JavaScript lifecycle state.
 * Call `init()` again before using any other session replay operation.
 *
 * @returns Promise that resolves when teardown is complete
 */
export async function teardown(): Promise<void> {
  if (!isInitialized) {
    logger.warn('SessionReplay is not initialized');
    return;
  }
  await NativeSessionReplay.teardown();
  isInitialized = false;
  numericSessionId = -1;
  customSessionIdActive = false;
  logger = createSessionReplayLogger();
}

function nativeConfig(config: ResolvedSessionReplayConfig): NativeSessionReplayConfig {
  // Resolve the effective mask level here — the single source of truth for the
  // default. `normalizeConfig()` already folded the deprecated top-level
  // `maskLevel` into `privacyConfig`, but `privacyConfig.maskLevel` can still be
  // `undefined` (no user value and no baked-in default), so fall back to
  // `'medium'`. Strip `privacyConfig` from the spread because the native bridge
  // only takes a flat `maskLevel` string.
  const { privacyConfig, customSessionId, sessionId, ...rest } = config;
  const resolvedMaskLevel: NativeSessionReplayConfig['maskLevel'] = privacyConfig.maskLevel ?? 'medium';
  const native: NativeSessionReplayConfig = {
    ...rest,
    logLevel: rest.logLevel as NativeSessionReplayConfig['logLevel'],
    // TODO(SDKRN-15): Migrate native bridge to accept the full privacyConfig object instead of a flat maskLevel string.
    maskLevel: resolvedMaskLevel,
  };
  // Native session identity is driven only through customSessionId. A string
  // custom id wins; otherwise the numeric session id is mapped to its string
  // form. The `-1` sentinel (no session set) maps to no custom id so the
  // "no active session" default is preserved.
  const effectiveCustomSessionId =
    customSessionId != null && customSessionId !== ''
      ? customSessionId
      : sessionId !== -1
      ? String(sessionId)
      : undefined;
  if (effectiveCustomSessionId !== undefined) {
    native.customSessionId = effectiveCustomSessionId;
  }
  return native;
}

export async function privateInit(
  config: SessionReplayConfig,
  newLogger: ReturnType<typeof createSessionReplayLogger>,
): Promise<void> {
  logger = newLogger;
  return init(config);
}
