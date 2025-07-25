import { IConfig, LogLevel, ILogger } from '@amplitude/analytics-core';
import { StoreType, ConsoleLogLevel } from '../typings/session-replay';

export interface SamplingConfig {
  sample_rate: number;
  capture_enabled: boolean;
}

export interface InteractionConfig {
  trackEveryNms?: number;
  enabled: boolean; // defaults to false
  batch: boolean; // defaults to false
  /**
   * UGC filter rules.
   */
  ugcFilterRules?: UGCFilterRule[];
}

export interface LoggingConfig {
  console: {
    enabled: boolean;
    levels: ConsoleLogLevel[];
  };
  network?: {
    enabled: boolean;
  };
}

export type SessionReplayRemoteConfig = {
  sr_sampling_config?: SamplingConfig;
  sr_privacy_config?: PrivacyConfig;
  sr_interaction_config?: InteractionConfig;
  sr_logging_config?: LoggingConfig;
};

export interface SessionReplayRemoteConfigAPIResponse {
  configs: {
    sessionReplay: SessionReplayRemoteConfig;
  };
}

export type MaskLevel =
  | 'light' // only mask a subset of inputs that's deemed sensitive - password, credit card, telephone #, email. These are information we never want to capture.
  | 'medium' // mask all inputs
  | 'conservative'; // mask all inputs and all texts

export const DEFAULT_MASK_LEVEL = 'medium';

// err on the side of excluding more
export type PrivacyConfig = {
  blockSelector?: string | string[]; // exclude in the UI
  defaultMaskLevel?: MaskLevel;
  maskSelector?: string[];
  unmaskSelector?: string[];
};

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

export interface SessionReplayLocalConfig extends IConfig {
  apiKey: string;
  loggerProvider: ILogger;
  /**
   * LogLevel.None or LogLevel.Error or LogLevel.Warn or LogLevel.Verbose or LogLevel.Debug.
   * Sets the log level.
   *
   * @defaultValue LogLevel.Warn
   */
  logLevel: LogLevel;
  /**
   * The maximum number of retries allowed for sending replay events.
   * Once this limit is reached, failed events will no longer be sent.
   *
   * @defaultValue 2
   */
  flushMaxRetries: number;
  /**
   * Use this option to control how many sessions to select for replay collection.
   * The number should be a decimal between 0 and 1, for example 0.4, representing
   * the fraction of sessions to have randomly selected for replay collection.
   * Over a large number of sessions, 0.4 would select 40% of those sessions.
   * Sample rates as small as six decimal places (0.000001) are supported.
   *
   * @defaultValue 0
   */
  sampleRate: number;
  privacyConfig?: PrivacyConfig;
  /**
   * Adds additional debug event property to help debug instrumentation issues
   * (such as mismatching apps). Only recommended for debugging initial setup,
   * and not recommended for production.
   */
  debugMode?: boolean;
  /**
   * Specifies the endpoint URL to fetch remote configuration.
   * If provided, it overrides the default server zone configuration.
   */
  configServerUrl?: string;
  /**
   * Specifies the endpoint URL for sending session replay data.
   * If provided, it overrides the default server zone configuration.
   */
  trackServerUrl?: string;
  /**
   * If stylesheets are inlined, the contents of the stylesheet will be stored.
   * During replay, the stored stylesheet will be used instead of attempting to fetch it remotely.
   * This prevents replays from appearing broken due to missing stylesheets.
   * Note: Inlining stylesheets may not work in all cases.
   */
  shouldInlineStylesheet?: boolean;
  version?: SessionReplayVersion;
  /**
   * Performance configuration config. If enabled, we will defer compression
   * to be done during the browser's idle periods.
   */
  performanceConfig?: SessionReplayPerformanceConfig;
  /**
   * Specifies how replay events should be stored. `idb` uses IndexedDB to persist replay events
   * when all events cannot be sent during capture. `memory` stores replay events only in memory,
   * meaning events are lost when the page is closed. If IndexedDB is unavailable, the system falls back to `memory`.
   */
  storeType: StoreType;

  /**
   * Experimental features.
   */
  experimental?: {
    /**
     * If the SDK should compress the replay events using a webworker.
     */
    useWebWorker: boolean;
  };

  /**
   * Remove certain parts of the DOM from being captured. These are typically ignored when blocking by selectors.
   */
  omitElementTags?: {
    /**
     * If true, removes script tags from the DOM, but not noscript tags.
     */
    script?: boolean;
    /**
     * If true, removes comment tags from the DOM.
     */
    comment?: boolean;
  };

  /**
   * If true, applies a background color to blocked elements in the replay.
   * This helps visualize which elements are blocked from being captured.
   */
  applyBackgroundColorToBlockedElements?: boolean;
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
  interactionConfig?: InteractionConfig;
}

export interface SessionReplayJoinedConfig extends SessionReplayLocalConfig {
  captureEnabled?: boolean;
  interactionConfig?: InteractionConfig;
  loggingConfig?: LoggingConfig;
}

export interface SessionReplayRemoteConfigFetch {
  getServerUrl: () => void;
  getSamplingConfig: (sessionId?: number) => Promise<SessionReplayRemoteConfig['sr_sampling_config'] | void>;
  fetchRemoteConfig: (sessionId?: number) => Promise<SessionReplayRemoteConfig | void>;
  getRemoteConfig: (sessionId?: number) => Promise<SessionReplayRemoteConfig | void>;
}

export interface SessionReplayConfigs {
  localConfig: SessionReplayLocalConfig;
  joinedConfig: SessionReplayJoinedConfig;
  remoteConfig: SessionReplayRemoteConfig | undefined;
}
export interface SessionReplayJoinedConfigGenerator {
  generateJoinedConfig: (sessionId?: string | number) => Promise<SessionReplayConfigs>;
}

export interface SessionReplayMetadata {
  remoteConfig: SessionReplayRemoteConfig | undefined;
  localConfig: SessionReplayLocalConfig;
  joinedConfig: SessionReplayJoinedConfig;
  framework?: {
    name: string;
    version: string;
  };
  sessionId: string | number | undefined;
  hashValue?: number;
  sampleRate: number;
  replaySDKType: string | null;
  replaySDKVersion: string | undefined;
  standaloneSDKType: string;
  standaloneSDKVersion: string | undefined;
}

export interface SessionReplayVersion {
  version: string;
  type: SessionReplayType;
}

/**
 * Configuration options for session replay performance.
 */
export interface SessionReplayPerformanceConfig {
  /**
   * If enabled, event compression will be deferred to occur during the browser's idle periods.
   */
  enabled: boolean;
  /**
   * Optional timeout in milliseconds for the `requestIdleCallback` API.
   * If specified, this value will be used to set a maximum time for the browser to wait
   * before executing the deferred compression task, even if the browser is not idle.
   */
  timeout?: number;
}

export type SessionReplayType = 'standalone' | 'plugin' | 'segment';
