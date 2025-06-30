import { NativeSessionReplay, type NativeSessionReplayConfig } from './native-module';
import { getDefaultConfig, SessionReplayConfig } from './session-replay-config';
import { createSessionReplayLogger } from './logger';
import { VERSION } from './version';

let fullConfig: Required<SessionReplayConfig> | null = null;
let isInitialized = false;
let logger = createSessionReplayLogger();

/**
 * Configure the SDK and begin collecting replays.
 * This function must be called before any other session replay operations.
 *
 * @param config - Configuration object containing API key, device ID, session ID, and other options
 * @returns Promise that resolves when initialization is complete
 * @throws Error if initialization fails
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

  fullConfig = {
    ...getDefaultConfig(),
    ...config,
  };

  logger.setLogLevel(fullConfig.logLevel);
  logger.log(`initializing @amplitude/session-replay-react-native version: ${VERSION} with config: `, fullConfig);

  try {
    await NativeSessionReplay.setup(nativeConfig(fullConfig));
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
  await NativeSessionReplay.setSessionId(sessionId);
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
  return await NativeSessionReplay.getSessionId();
}

/**
 * Interface for session replay properties that should be attached to Amplitude events.
 * These properties help correlate events with session recordings.
 */
export interface SessionReplayProperties {
  [key: string]: string | boolean | null;
}

/**
 * When you send events to Amplitude, call this function to get the most up-to-date session replay properties for the event.
 * Collect Session Replay properties to send with other event properties.
 *
 * @returns Promise that resolves to an object containing session replay metadata
 *
 * @example
 * ```typescript
 * const sessionReplayProperties = await getSessionReplayProperties();
 * analytics.track('Button Clicked', {
 *   buttonName: 'submit',
 *   ...sessionReplayProperties // Merge session replay properties
 * });
 * ```
 */
export async function getSessionReplayProperties(): Promise<SessionReplayProperties> {
  if (!isInitialized) {
    logger.warn('SessionReplay is not initialized');
    return {};
  }
  const properties = await NativeSessionReplay.getSessionReplayProperties();
  return properties as SessionReplayProperties;
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
 * If autoStart is enabled in the configuration, this is called automatically during initialization.
 *
 * @returns Promise that resolves when recording starts
 *
 * @example
 * ```typescript
 * // Start recording manually if autoStart is false
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

function nativeConfig(config: Required<SessionReplayConfig>): NativeSessionReplayConfig {
  return {
    ...config,
    logLevel: config.logLevel as NativeSessionReplayConfig['logLevel'],
    maskLevel: config.maskLevel.toString() as NativeSessionReplayConfig['maskLevel'],
  };
}

export async function privateInit(
  config: SessionReplayConfig,
  newLogger: ReturnType<typeof createSessionReplayLogger>,
): Promise<void> {
  logger = newLogger;
  return init(config);
}
