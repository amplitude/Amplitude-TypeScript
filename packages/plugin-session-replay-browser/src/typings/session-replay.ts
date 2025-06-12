import { Event } from '@amplitude/analytics-core';
import {
  StoreType,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type SessionReplayOptions as StandaloneSessionReplayOptions, // used for documentation
} from '@amplitude/session-replay-browser';

export type MaskLevel =
  | 'light' // only mask a subset of inputs that’s deemed sensitive - password, credit card, telephone #, email. These are information we never want to capture.
  | 'medium' // mask all inputs
  | 'conservative'; // mask all inputs and all texts

export interface SessionReplayPrivacyConfig {
  blockSelector?: string | string[];
  defaultMaskLevel?: MaskLevel;
  maskSelector?: string[];
  unmaskSelector?: string[];
}

export interface SessionReplayPerformanceConfig {
  enabled: boolean;
  timeout?: number;
}

export interface SessionReplayOptions {
  /**
   * @see {@link StandaloneSessionReplayOptions.sampleRate}
   */
  sampleRate?: number;
  /**
   * @see {@link StandaloneSessionReplayOptions.privacyConfig}
   */
  privacyConfig?: SessionReplayPrivacyConfig;
  /**
   * @see {@link StandaloneSessionReplayOptions.debugMode}
   */
  debugMode?: boolean;
  /**
   * If this is enabled we will force the browser SDK to also send start and end session events.
   */
  forceSessionTracking?: boolean;
  /**
   * @see {@link StandaloneSessionReplayOptions.configServerUrl}
   */
  configServerUrl?: string;
  /**
   * @see {@link StandaloneSessionReplayOptions.trackServerUrl}
   */
  trackServerUrl?: string;
  /**
   * @see {@link StandaloneSessionReplayOptions.shouldInlineStylesheet}
   */
  shouldInlineStylesheet?: boolean;
  /**
   * @see {@link StandaloneSessionReplayOptions.performanceConfig}
   */
  performanceConfig?: SessionReplayPerformanceConfig;
  /**
   * @see {@link StandaloneSessionReplayOptions.storeType}
   */
  storeType?: StoreType;
  /**
   * Override the device ID for session replay.
   */
  deviceId?: string;
  /**
   * Dynamically overrides the session ID for replay. Ensure stability to avoid frequent restarts.
   * @param event Browser SDK event
   * @returns The session ID for the session replay.
   */
  customSessionId?: (event: Event) => string | undefined;
  /**
   * @see {@link StandaloneSessionReplayOptions.experimental}
   */
  experimental?: {
    useWebWorker: boolean;
  };
  /**
   * If true, applies a background color to blocked elements for visual masking. Defaults to false.
   */
  applyBackgroundColorToBlockedElements?: boolean;
}
