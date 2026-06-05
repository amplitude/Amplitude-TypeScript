import { IConfig, LogLevel, ILogger } from '@amplitude/analytics-core';
import { StoreType, ConsoleLogLevel } from '../typings/session-replay';
import { TargetingFlag } from '@amplitude/targeting';

export interface SamplingConfig {
  sample_rate: number;
  capture_enabled: boolean;
  min_session_duration_ms?: number;
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
    body?: {
      request?: boolean;
      response?: boolean;
      maxBodySizeBytes?: number;
    };
  };
}

export type TargetingConfig = TargetingFlag;

export type SessionReplayRemoteConfig = {
  sr_sampling_config?: SamplingConfig;
  sr_privacy_config?: PrivacyConfig;
  sr_interaction_config?: InteractionConfig;
  sr_logging_config?: LoggingConfig;
  sr_targeting_config?: TargetingConfig;
};

export interface SessionReplayRemoteConfigAPIResponse {
  configs: {
    sessionReplay: SessionReplayRemoteConfig;
  };
}

export type MaskLevel =
  | 'light' // only mask a subset of inputs that's deemed sensitive - password, credit card, telephone #, email. These are information we never want to capture.
  | 'medium' // mask all form fields (inputs); page text is captured as-is
  | 'conservative'; // mask all inputs and all texts

export const DEFAULT_MASK_LEVEL = 'medium';

// err on the side of excluding more
export type PrivacyConfig = {
  blockSelector?: string | string[]; // exclude in the UI
  defaultMaskLevel?: MaskLevel;
  maskSelector?: string[];
  unmaskSelector?: string[];
  maskAttributes?: string[]; // HTML attribute names to mask (e.g. ["placeholder", "aria-label"])
  /**
   * Per-URL overrides for `defaultMaskLevel`. Each entry contains a glob pattern (`match`)
   * and a `maskLevel` to apply when the current page URL matches that pattern.
   * Rules are evaluated in order; the first match wins. Remote rules take precedence
   * over local rules (remote entries are prepended before local entries).
   *
   * @example
   * urlMaskLevels: [
   *   { match: 'https://example.com/checkout/*', maskLevel: 'conservative' },
   *   { match: 'https://example.com/public/*',   maskLevel: 'light' },
   * ]
   */
  urlMaskLevels?: Array<{ match: string; maskLevel: MaskLevel }>;
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

export interface CrossOriginIframesConfig {
  enabled: boolean;
  /**
   * When true (default), the parent SDK sends start/stop signals to child iframes via
   * postMessage, keeping their recording lifecycle in sync with the parent.
   *
   * **Privacy note:** The child page's rrweb instance performs its own DOM serialization,
   * so the parent's privacy config (mask levels, block selectors) does NOT automatically
   * apply inside the iframe. Privacy settings must be configured independently on the child page.
   *
   * **Third-party iframes:** Cannot capture iframes you don't control (e.g. Stripe, Google
   * Maps) — both parent and child pages must load the SDK with `crossOriginIframes.enabled: true`.
   *
   * Set to `false` to skip coordination and manage the child recording lifecycle yourself.
   * @defaultValue true
   */
  coordinateChildren?: boolean;
}

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
   * If true, the SDK will compress replay events using a web worker.
   * This offloads compression to a separate thread, improving performance on the main thread.
   *
   * @defaultValue false
   */
  useWebWorker?: boolean;

  /**
   * Controls transport-layer gzip compression of session replay request bodies.
   * When true (default), the SDK gzip-compresses the JSON request body via the browser's
   * `CompressionStream` API and sets `Content-Encoding: gzip` on the POST. When false,
   * the SDK sends the raw JSON body with no `Content-Encoding` header.
   *
   * Disabling is intended as a debugging / safety opt-out (e.g. for diagnosing
   * server-side decompression issues); it increases egress bytes and is not
   * recommended for production.
   *
   * Note: This is independent of `useWebWorker` / `performanceConfig`, which control
   * per-event rrweb compression that runs before events are queued.
   *
   * @defaultValue true
   */
  enableTransportCompression?: boolean;

  userProperties?: { [key: string]: any };

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
  /**
   * When true (default), the CSS rules of any `adoptedStyleSheets` on shadow roots and
   * the document are serialized **inline** within the full snapshot. This makes the snapshot
   * self-contained so that shadow DOM styles are replayed correctly even if subsequent
   * incremental `AdoptedStyleSheet` events are dropped in transit.
   *
   * Set to `false` to revert to the legacy behavior where adopted stylesheet rules are
   * emitted as separate incremental events (which may be lost if delivery is unreliable).
   * Only consider opting out if snapshot payload size is a critical concern.
   *
   * @defaultValue true
   */
  captureAdoptedStyleSheets?: boolean;
  /**
   * Enables recording of cross-origin iframes. Both the parent page and each child iframe
   * page must load the Amplitude Session Replay SDK with this option enabled.
   *
   * When enabled, rrweb uses `postMessage` to relay child DOM events to the parent, which
   * merges them into a single unified event stream.
   */
  crossOriginIframes?: CrossOriginIframesConfig;
  /** Interval in ms at which the SDK takes a full DOM snapshot. Disabled by default — periodic snapshots are expensive. Recommended value: 300000 (5 min). */
  fullSnapshotIntervalMs?: number;
  /**
   * Controls how often the SDK splits buffered rrweb events into a sequence and dispatches
   * the resulting batch to the server. The interval starts at `minIntervalMs` and grows by
   * `minIntervalMs` after each split, capped at `maxIntervalMs`. Lowering values increases
   * replay availability latency improvements at the cost of more requests; raising them
   * reduces request volume (and 200+`X-Session-Replay-Event-Skipped` throttling responses)
   * at the cost of slightly delayed replay availability.
   *
   * Defaults: `{ minIntervalMs: 500, maxIntervalMs: 10_000 }`. Tune up if the server is
   * back-pressuring the SDK on session start.
   */
  flushIntervalConfig?: FlushIntervalConfig;
  /**
   * When true (default), every rrweb full snapshot is flushed to the server immediately so
   * replays become playable as early as possible. Set to `false` to defer full-snapshot
   * sends to the normal interval/size flush cadence instead. The snapshot is still compressed
   * and buffered immediately either way (ordering and page-exit beacon coverage are preserved);
   * only the eager network send is suppressed. Disabling reduces request volume for pages that
   * produce many full snapshots (e.g. focus-driven or `fullSnapshotIntervalMs` checkouts),
   * especially when many SDK instances run on the same page.
   *
   * @defaultValue true
   */
  eagerFullSnapshotSend?: boolean;
  /**
   * When true (default), the window `focus` listener forces a fresh rrweb full snapshot
   * (`takeFullSnapshot`) every time the page regains focus, so the replay reflects any DOM
   * changes that happened while the tab was backgrounded. Set to `false` to skip the
   * on-focus full snapshot entirely (recording simply continues from the existing stream).
   *
   * On pages with heavy focus churn (e.g. embedded iframes, inline editors that repeatedly
   * steal and return focus) this fires constantly, and when combined with
   * `eagerFullSnapshotSend` each focus produces an immediate network send — the primary
   * driver of focus-driven request storms. Disabling removes the snapshot (and therefore the
   * send) at the cost of slightly staler post-focus frames.
   *
   * @defaultValue true
   */
  captureFullSnapshotOnFocus?: boolean;
  /**
   * Raw (uncompressed) UTF-8 byte cap for a single buffered events list before the store
   * splits it into its own request. Larger values produce fewer, larger requests (the primary
   * steady-state lever for request volume); smaller values split sooner. Payloads are gzipped
   * on the wire, so several hundred KB of replay JSON compresses to well under 100 KB.
   *
   * Advanced/debug knob — the default already balances request volume against the server's
   * decompressed-size split threshold. Clamped to a safe range; values outside it are clamped
   * and logged. Defaults to the SDK's internal `MAX_EVENT_LIST_SIZE`.
   *
   * @defaultValue 700000
   */
  maxPersistedEventsSizeBytes?: number;
  /**
   * Raw (uncompressed) UTF-8 byte cap for a single rrweb event. Events larger than this are
   * dropped (with a warning) both at capture time and as a pre-send backstop, because the SR
   * ingest service rejects a single event above ~10 MB. Lower this to exercise drop behavior
   * for large full snapshots while debugging.
   *
   * Advanced/debug knob. Clamped to a safe range; values outside it are clamped and logged.
   * Defaults to the SDK's internal `MAX_SINGLE_EVENT_SIZE`.
   *
   * @defaultValue 9000000
   */
  maxSingleEventSizeBytes?: number;
}

export interface FlushIntervalConfig {
  /**
   * Lower bound on the rrweb event-split interval in milliseconds. Also the increment
   * added to the interval after each split. Must be > 0; values are clamped to a 100ms floor.
   *
   * @defaultValue 500
   */
  minIntervalMs?: number;
  /**
   * Upper bound on the rrweb event-split interval in milliseconds. Must be >= `minIntervalMs`.
   *
   * @defaultValue 10000
   */
  maxIntervalMs?: number;
}

export interface SessionReplayJoinedConfig extends SessionReplayLocalConfig {
  captureEnabled?: boolean;
  interactionConfig?: InteractionConfig;
  loggingConfig?: LoggingConfig;
  targetingConfig?: TargetingConfig;
  minSessionDurationMs?: number;
}

export interface SessionReplayConfigs {
  localConfig: SessionReplayLocalConfig;
  joinedConfig: SessionReplayJoinedConfig;
  remoteConfig: SessionReplayRemoteConfig | undefined;
}
export interface SessionReplayJoinedConfigGenerator {
  generateJoinedConfig: () => Promise<SessionReplayConfigs>;
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
  /**
   * If enabled, consecutive mutation events will be merged into a single event before
   * compression, reducing stored event count without changing replay semantics.
   * Defaults to false.
   */
  mergeMutations?: boolean;
  /**
   * Performance configuration for interaction tracking (clicks, scrolls).
   */
  interaction?: InteractionPerformanceConfig;
}

/**
 * Performance configuration for interaction tracking, specifically for CSS selector generation.
 */
export interface InteractionPerformanceConfig {
  /**
   * Maximum time in milliseconds allowed for CSS selector generation.
   * If selector generation takes longer than this, it will throw a timeout error.
   * Default: undefined (no timeout limit)
   */
  timeoutMs?: number;
  /**
   * Maximum number of attempts to optimize/simplify the CSS selector path.
   * Higher values may produce shorter selectors but take longer to compute.
   * Default: 10000
   */
  maxNumberOfTries?: number;
  /**
   * Maximum number of CSS selector combinations to test for uniqueness.
   * If more combinations would be generated, falls back to a simpler strategy.
   * Default: 1000
   */
  threshold?: number;
}

export type SessionReplayType = 'standalone' | 'plugin' | 'segment';
