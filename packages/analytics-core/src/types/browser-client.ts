import { TransportType } from './transport';
import { CoreClient } from './client/core-client';
import { AnalyticsIdentity, Plugin } from './plugin';
import { AmplitudeReturn } from '../utils/return-wrapper';
import { BrowserConfig, BrowserOptions } from './config/browser-config';

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
   * When setting a custom session ID, make sure the value is in milliseconds since epoch (Unix Timestamp).
   *
   * ```typescript
   * setSessionId(Date.now());
   * ```
   */
  setSessionId(sessionId: number): void;

  /**
   * Extends the current session (advanced)
   *
   * Normally sessions are extended automatically by track()'ing events. If you want to extend the session without
   * tracking and event, this will set the last user interaction to the current time.
   *
   * ```typescript
   * extendSession();
   * ```
   */
  extendSession(): void;

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
  init(apiKey: string, options?: BrowserOptions): AmplitudeReturn<void>;

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

  /**
   * Adds a new plugin.
   *
   * ```typescript
   * const plugin = {
   *   name: 'my-plugin',
   *   type: 'enrichment',
   *   async setup(config: BrowserConfig, amplitude: BrowserClient) {
   *     return;
   *   },
   *   async execute(event: Event) {
   *     return event;
   *   },
   * };
   * amplitude.add(plugin);
   * ```
   */
  add(plugin: Plugin<BrowserClient, BrowserConfig>): AmplitudeReturn<void>;

  /**
   * Returns the current identity.
   *
   * ```typescript
   * const identity = getIdentity();
   * ```
   */
  getIdentity(): AnalyticsIdentity;

  /**
   * Returns the current optOut config value.
   *
   * ```typescript
   * const optOut = getOptOut();
   * ```
   */
  getOptOut(): boolean;
}
