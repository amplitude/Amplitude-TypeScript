import { NativeModules, Platform } from 'react-native';

const LINKING_ERROR =
  `The package '@amplitude/session-replay-react-native' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
  '- You rebuilt the app after installing the package\n' +
  '- You are not using Expo Go\n';

export const NativeSessionReplay = NativeModules.NativeSessionReplay
  ? (NativeModules.NativeSessionReplay as NativeSessionReplaySpec)
  : (new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      },
    ) as NativeSessionReplaySpec);

/**
 * Configuration interface for setting up the native iOS and Android session replay modules.
 * This interface defines all the parameters required to initialize the native session replay functionality.
 */
export interface NativeSessionReplayConfig {
  /** Your Amplitude API key for authentication and data routing */
  apiKey: string;
  /** Whether to automatically start recording when the module is initialized */
  autoStart: boolean;
  /** Device identifier that matches the device ID sent with Amplitude events */
  deviceId: string | null;
  /** Whether to enable remote configuration for dynamic settings updates */
  enableRemoteConfig: boolean;
  /** Log level for native module logging (0=None, 1=Error, 2=Warn, 3=Verbose, 4=Debug) */
  logLevel: 0 | 1 | 2 | 3 | 4;
  /** Level of masking applied to sensitive content in recordings */
  maskLevel: 'light' | 'medium' | 'conservative';
  /** Whether the user has opted out of session replay recording */
  optOut: boolean;
  /** Sample rate for session replay (0.0 to 1.0) determining recording frequency */
  sampleRate: number;
  /** Amplitude server zone for data routing ('US' or 'EU') */
  serverZone: 'US' | 'EU';
  /** Current session identifier for correlating events with recordings */
  sessionId: number;
}

export interface NativeSessionReplayProperties {
  [key: string]: string | number | boolean;
}

/**
 * Interface defining the native session replay module specification.
 * This interface provides the contract for communication between JavaScript and
 * the native iOS/Android session replay modules through React Native's bridge.
 *
 * All methods are asynchronous and return Promises to handle the bridge communication
 * between JavaScript and native code.
 */
export interface NativeSessionReplaySpec {
  /**
   * Flushes any pending session replay data to the server.
   * Forces immediate upload of recorded session data that may be buffered locally.
   */
  flush(): Promise<void>;

  /**
   * Retrieves the current session identifier from the native module.
   * @returns Promise resolving to the current session ID number
   * @note OLD ARCH: ideally we want to cache that on JS side to avoid bridge overhead
   */
  getSessionId(): Promise<number>;

  /**
   * Retrieves session replay properties that should be attached to Amplitude events.
   * These properties help correlate events with session recordings.
   * @returns Promise resolving to an object containing session replay metadata
   * @note OLD ARCH: ideally we want to cache that on JS side to avoid bridge overhead
   */
  getSessionReplayProperties(): Promise<NativeSessionReplayProperties>;

  /**
   * Updates the device identifier used for session replay tracking.
   * @param deviceId - The device identifier string, or null to clear the device ID
   * @note OLD ARCH: combine those into one method to avoid bridge overhead
   */
  setDeviceId(deviceId: string | null): Promise<void>;

  /**
   * Updates the session identifier used for session replay tracking.
   * @param sessionId - The session identifier number
   * @note OLD ARCH: combine those into one method to avoid bridge overhead
   */
  setSessionId(sessionId: number): Promise<void>;

  /**
   * Initializes the native session replay module with the provided configuration.
   * This method must be called before any other session replay operations.
   * @param config - Configuration object containing all necessary parameters for setup
   */
  setup(config: NativeSessionReplayConfig): Promise<void>;

  /**
   * Starts session replay recording.
   * Begins capturing user interactions and screen content for replay.
   */
  start(): Promise<void>;

  /**
   * Stops session replay recording.
   * Ends the current recording session and processes any captured data.
   */
  stop(): Promise<void>;
}
