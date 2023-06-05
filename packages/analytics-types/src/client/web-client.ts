import { AmplitudeReturn } from '../amplitude-promise';
import { BrowserOptions, ReactNativeOptions } from '../config';
import { TransportType } from '../transport';
import { CoreClient } from './core-client';

interface Client extends CoreClient {
  /**
   * Returns current user ID.
   *
   * ```typescript
   * const userId = getUserId();
   * ```
   */
  getUserId(): string | undefined;

  /**
   * Sets a new user ID.
   *
   * ```typescript
   * setUserId('userId');
   * ```
   */
  setUserId(userId: string | undefined): void;
  setUserId(userId: string | undefined, startNewSession: boolean): void;

  /**
   * Returns current device ID.
   *
   * ```typescript
   * const deviceId = getDeviceId();
   * ```
   */
  getDeviceId(): string | undefined;

  /**
   * Sets a new device ID.
   * When setting a custom device ID, make sure the value is sufficiently unique.
   * A uuid is recommended.
   *
   * ```typescript
   * setDeviceId('deviceId');
   * ```
   */
  setDeviceId(deviceId: string): void;

  /**
   * Returns current session ID.
   *
   * ```typescript
   * const sessionId = getSessionId();
   * ```
   */
  getSessionId(): number | undefined;

  /**
   * Sets a new session ID.
   * When settign a custom session ID, make sure the value is in milliseconds since epoch (Unix Timestamp).
   *
   * ```typescript
   * setSessionId(Date.now());
   * ```
   */
  setSessionId(sessionId: number): void;

  /**
   * Anonymizes users after they log out, by:
   *
   * * setting userId to undefined
   * * setting deviceId to a new uuid value
   *
   * With an undefined userId and a completely new deviceId, the current user would appear as a brand new user in dashboard.
   *
   * ```typescript
   * import { reset } from '@amplitude/analytics-browser';
   *
   * reset();
   * ```
   */
  reset(): void;
}

export interface BrowserClient extends Client {
  /**
   * Initializes the Amplitude SDK with your apiKey, optional configurations.
   * This method must be called before any other operations.
   *
   * ```typescript
   * await init(API_KEY, options).promise;
   * ```
   */
  init(apiKey: string, userId?: string, options?: BrowserOptions): AmplitudeReturn<void>;

  /**
   * Sets the network transport type for events.
   *
   * ```typescript
   * // Use Fetch API
   * setTransport('fetch');
   *
   * // Use XMLHttpRequest API
   * setTransport('xhr');
   *
   * // Use navigator.sendBeacon API
   * setTransport('beacon');
   * ```
   */
  setTransport(transport: TransportType): void;
}

export interface ReactNativeClient extends Client {
  /**
   * Initializes the Amplitude SDK with your apiKey, optional configurations.
   * This method must be called before any other operations.
   *
   * ```typescript
   * await init(API_KEY, options).promise;
   * ```
   */
  init(apiKey: string, userId?: string, options?: ReactNativeOptions): AmplitudeReturn<void>;
}
