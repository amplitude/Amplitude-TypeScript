import { TransportTypeOrOptions } from '../transport';
import { Client } from './core-client';
import { AnalyticsIdentity, Plugin } from '../plugin';
import { AmplitudeReturn } from '../../utils/return-wrapper';
import { BrowserConfig, BrowserOptions } from '../config/browser-config';

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
   *
   * // Use Fetch API with custom headers
   * setTransport({ type: 'fetch', headers: { 'X-Custom-Header': 'value' } });
   * ```
   */
  setTransport(transport: TransportTypeOrOptions): void;

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
   * Sets the identity (userId, deviceId, and/or userProperties).
   * This is a unified shortcut for `setUserId()`, `setDeviceId()`, and setting user properties.
   * When userProperties change, an identify event is automatically sent.
   *
   * **Important limitation:** When userProperties are replaced, the local state is fully replaced
   * but the identify event sent to the server only includes `$set` operations for the new properties.
   * Properties removed from the local state are **not** `$unset` on the server.
   *
   * For example, changing from `{plan: 'premium', theme: 'dark'}` to `{plan: 'basic'}` removes
   * `theme` locally but leaves it on the server. To remove a property from the server, use
   * `identify()` with `Identify.unset()` directly.
   *
   * ```typescript
   * // Set user properties (auto-sends identify event with $set)
   * setIdentity({ userProperties: { plan: 'premium' } });
   *
   * // Set userId (equivalent to setUserId('user-123'))
   * setIdentity({ userId: 'user-123' });
   *
   * // Set deviceId (equivalent to setDeviceId('device-456'))
   * setIdentity({ deviceId: 'device-456' });
   *
   * // Set multiple identity fields together
   * setIdentity({ userId: 'user-123', deviceId: 'device-456', userProperties: { name: 'John' } });
   *
   * // To remove a property from the server, use identify() directly:
   * const identify = new Identify();
   * identify.unset('theme');
   * amplitude.identify(identify);
   * ```
   */
  setIdentity(identity: Partial<AnalyticsIdentity>): void;

  /**
   * Returns the current optOut config value.
   *
   * ```typescript
   * const optOut = getOptOut();
   * ```
   */
  getOptOut(): boolean | undefined;

  /**
   * @experimental
   * WARNING: This method is for internal testing only and is not part of the public API.
   * It may be changed or removed at any time without notice.
   *
   * Sets the diagnostics sample rate before amplitude.init()
   * @param sampleRate - The sample rate to set
   */
  _setDiagnosticsSampleRate(sampleRate: number): void;
}
