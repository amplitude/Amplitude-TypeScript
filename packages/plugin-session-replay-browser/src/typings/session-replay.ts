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

/**
 * UGC filter rule.
 */
export type UGCFilterRule = {
  /**
   * The selector of the UGC element.
   */
  selector: string;
  /**
   * The replacement text for the UGC element.
   */
  replacement: string;
};

export interface SessionReplayInteractionConfig {
  trackEveryNms?: number;
  enabled: boolean; // defaults to false
  batch: boolean; // defaults to false
  /**
   * UGC filter rules.
   */
  ugcFilterRules?: UGCFilterRule[];
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
   * @see {@link StandaloneSessionReplayOptions.omitElementTags}
   */
  omitElementTags?: {
    script?: boolean;
    comment?: boolean;
  };
  /**
   * If true, applies a background color to blocked elements for visual masking. Defaults to false.
   */
  applyBackgroundColorToBlockedElements?: boolean;

  interactionConfig?: SessionReplayInteractionConfig;

  /**
   * Enables URL change polling as a fallback for SPA route tracking.
   * When enabled, the SDK will periodically check for URL changes every second
   * in addition to patching the History API. This is useful for edge cases where
   * route changes might bypass the standard History API methods.
   *
   * @defaultValue false
   */
  enableUrlChangePolling?: boolean;
  /**
   * Specifies the interval in milliseconds for URL change polling when enableUrlChangePolling is true.
   * The SDK will check for URL changes at this interval as a fallback for SPA route tracking.
   *
   * @defaultValue 1000
   */
  urlChangePollingInterval?: number;
  /**
   * Whether to capture document title in URL change events.
   * When disabled, the title field will be empty in URL change events.
   *
   * @defaultValue false
   */
  captureDocumentTitle?: boolean;
}
