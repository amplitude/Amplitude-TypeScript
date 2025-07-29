import { TransportType } from '../transport';
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
  getOptOut(): boolean | undefined;
}
