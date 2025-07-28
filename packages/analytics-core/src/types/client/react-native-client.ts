import { Client } from './core-client';
import { ReactNativeConfig, ReactNativeOptions } from '../config/react-native-config';
import { AmplitudeReturn } from '../../utils/return-wrapper';
import { Plugin } from '../plugin';

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

  /**
   * Adds a new plugin.
   *
   * ```typescript
   * const plugin = {
   *   name: 'my-plugin',
   *   type: 'enrichment',
   *   async setup(config: ReactNativeConfig, amplitude: ReactNativeClient) {
   *     return;
   *   },
   *   async execute(event: Event) {
   *     return event;
   *   },
   * };
   * amplitude.add(plugin);
   * ```
   */
  add(plugin: Plugin<ReactNativeClient, ReactNativeConfig>): AmplitudeReturn<void>;
}
