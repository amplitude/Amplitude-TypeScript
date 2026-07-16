import { Client } from './core-client';
import { ReactNativeConfig, ReactNativeOptions } from '../config/react-native-config';
import { AmplitudeReturn } from '../../utils/return-wrapper';
import { Plugin } from '../plugin';
import { EventOptions } from '../event/base-event';
import { Result } from '../result';

/**
 * Minimal React Navigation state shape used by `trackNavigationStateChange`.
 * Compatible with React Navigation's `NavigationState`, including nested navigators
 * (tabs, stacks inside stacks) via optional child `state`.
 */
export type NavigationState = {
  routes: {
    name: string;
    state?: NavigationState;
  }[];
  index: number;
};

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

  /**
   * Helper method to track a screen view event.
   *
   * Usage:
   * ```typescript
   * trackScreenView('Home', { 'Screen Category': 'Home' });
   * ```
   *
   * Equivalent to:
   * ```typescript
   * track('[Amplitude] Screen Viewed', {
   *   ['[Amplitude] Screen Name']: screenName,
   *   ...eventProperties,
   * }, eventOptions);
   * ```
   * @param screenName The name of the screen being viewed.
   * @param eventProperties Additional event properties to include in the event.
   * @param eventOptions Additional event options to include in the event.
   */
  trackScreenView(
    screenName: string,
    eventProperties?: Record<string, any>,
    eventOptions?: EventOptions,
  ): AmplitudeReturn<Result>;

  /**
   * Helper method to track a screen view from a React Navigation state change.
   *
   * Usage:
   * ```typescript
   * <NavigationContainer onStateChange={trackNavigationStateChange}>
   * ```
   *
   * @param navigationState The React Navigation state after a navigation change.
   *   No-ops when `undefined` (as React Navigation may emit on first mount),
   *   or when the focused leaf route name is unchanged (avoids duplicate screen views
   *   from param/history-only state updates).
   * @param eventProperties Additional event properties to include in the event.
   * @param eventOptions Additional event options to include in the event.
   */
  trackNavigationStateChange(
    navigationState: NavigationState | undefined,
    eventProperties?: Record<string, any>,
    eventOptions?: EventOptions,
  ): AmplitudeReturn<Result> | undefined;
}
