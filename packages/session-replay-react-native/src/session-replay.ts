// @refresh reset

import { NativeSessionReplay, type NativeSessionReplayConfig } from './native-module';
import { getDefaultConfig, SessionReplayConfig, SessionReplayConfigInternal } from './session-replay-config';
import { createSessionReplayLogger } from './logger';
import { VERSION } from './version';

type ResolvedSessionReplayConfig = Required<SessionReplayConfigInternal>;

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

// Mirrors the native parse (`Int64(customSessionId) ?? -1` on iOS,
// `toLongOrNull() ?: -1` on Android); `Number()` would accept whitespace,
// hex and the empty string that both platforms reject.
// Deliberately narrower than native: a JS `number` is an IEEE-754 double with
// 53 bits of integer precision, not 64, so integers beyond
// `Number.MAX_SAFE_INTEGER` resolve to `-1` instead of a rounded value.
// Returning `bigint` would break the public `Promise<number | null>` contract.
const INTEGER_SESSION_ID = /^[+-]?\d+$/;

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
 * Use a safe integer (see `Number.isSafeInteger`), such as `Date.now()`.
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
}

/**
 * Call whenever the alphanumeric session ID changes.
 * The value must match the Session ID sent as event properties to Amplitude.
 * While a custom session ID is active, `getSessionId()` returns it as a number
 * when it parses as a safe integer, and `-1` otherwise.
 *
 * @param customSessionId - The new alphanumeric session identifier
 */
export async function setCustomSessionId(customSessionId: string): Promise<void> {
  if (!isInitialized) {
    logger.warn('SessionReplay is not initialized');
    return;
  }
  await NativeSessionReplay.setCustomSessionId(customSessionId);
}

/**
 * Get the current alphanumeric session identifier from the session replay SDK.
 * Mirrors `getSessionId()`: it resolves to `null` before initialization and to
 * the active custom session id (which the native layer may report as `null`)
 * afterwards.
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
 * Resolves to the active session id as a number when it parses as an integer,
 * and to `-1` otherwise — for example while an alphanumeric custom session id
 * is active.
 *
 * Integers beyond `Number.MAX_SAFE_INTEGER` (2^53 - 1) also resolve to `-1`,
 * even though native accepts the full 64-bit range: a JavaScript `number` is a
 * double with 53 bits of integer precision and cannot hold them exactly.
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
  const customSessionId = await NativeSessionReplay.getCustomSessionId();
  if (customSessionId == null || !INTEGER_SESSION_ID.test(customSessionId)) {
    return -1;
  }
  const sessionId = Number(customSessionId);
  return Number.isSafeInteger(sessionId) ? sessionId : -1;
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
  logger = createSessionReplayLogger();
}

function nativeConfig(config: ResolvedSessionReplayConfig): NativeSessionReplayConfig {
  // Resolve the effective mask level here — the single source of truth for the
  // default. `normalizeConfig()` already folded the deprecated top-level
  // `maskLevel` into `privacyConfig`, but `privacyConfig.maskLevel` can still be
  // `undefined` (no user value and no baked-in default), so fall back to
  // `'medium'`. Strip `privacyConfig` from the spread because the native bridge
  // only takes a flat `maskLevel` string.
  const { privacyConfig, sessionId, ...rest } = config;
  const resolvedMaskLevel: NativeSessionReplayConfig['maskLevel'] = privacyConfig.maskLevel ?? 'medium';
  return {
    ...rest,
    logLevel: rest.logLevel as NativeSessionReplayConfig['logLevel'],
    // TODO(SDKRN-15): Migrate native bridge to accept the full privacyConfig object instead of a flat maskLevel string.
    maskLevel: resolvedMaskLevel,
    customSessionId: String(sessionId),
  };
}

export async function privateInit(
  config: SessionReplayConfig,
  newLogger: ReturnType<typeof createSessionReplayLogger>,
): Promise<void> {
  logger = newLogger;
  return init(config);
}
