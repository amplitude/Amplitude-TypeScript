import { Config, ILogger, Logger, FetchTransport, LogLevel } from '@amplitude/analytics-core';
import {
  DEFAULT_PERFORMANCE_CONFIG,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_SERVER_ZONE,
  DEFAULT_URL_CHANGE_POLLING_INTERVAL,
  MAX_INTERVAL,
  MIN_INTERVAL,
  UNMASK_TEXT_CLASS,
} from '../constants';
import { SessionReplayOptions, StoreType } from '../typings/session-replay';
import {
  SessionReplayLocalConfig as ISessionReplayLocalConfig,
  CrossOriginIframesConfig,
  FlushIntervalConfig,
  InteractionConfig,
  PrivacyConfig,
  SessionReplayPerformanceConfig,
  SessionReplayVersion,
} from './types';
import { SafeLoggerProvider } from '../logger';
import { validateUGCFilterRules } from '../helpers';

export const getDefaultConfig = () => ({
  flushMaxRetries: 2,
  logLevel: LogLevel.Warn,
  loggerProvider: new Logger(),
  transportProvider: new FetchTransport(),
});

export class SessionReplayLocalConfig extends Config implements ISessionReplayLocalConfig {
  apiKey: string;
  sampleRate: number;
  privacyConfig?: PrivacyConfig;
  interactionConfig?: InteractionConfig;
  debugMode?: boolean;
  configServerUrl?: string;
  trackServerUrl?: string;
  shouldInlineStylesheet?: boolean;
  version?: SessionReplayVersion;
  storeType: StoreType;
  performanceConfig?: SessionReplayPerformanceConfig;
  useWebWorker?: boolean;
  applyBackgroundColorToBlockedElements?: boolean;
  enableUrlChangePolling?: boolean;
  urlChangePollingInterval?: number;
  captureDocumentTitle?: boolean;
  captureAdoptedStyleSheets?: boolean;
  crossOriginIframes?: CrossOriginIframesConfig;
  fullSnapshotIntervalMs?: number;
  flushIntervalConfig?: FlushIntervalConfig;

  constructor(apiKey: string, options: SessionReplayOptions) {
    const defaultConfig = getDefaultConfig();
    super({
      transportProvider: defaultConfig.transportProvider,
      loggerProvider: new SafeLoggerProvider(options.loggerProvider || defaultConfig.loggerProvider),
      ...options,
      apiKey,
    });
    this.flushMaxRetries =
      options.flushMaxRetries !== undefined && options.flushMaxRetries <= defaultConfig.flushMaxRetries
        ? options.flushMaxRetries
        : defaultConfig.flushMaxRetries;

    this.apiKey = apiKey;
    this.sampleRate = options.sampleRate || DEFAULT_SAMPLE_RATE;
    this.serverZone = options.serverZone || DEFAULT_SERVER_ZONE;
    this.configServerUrl = options.configServerUrl;
    this.trackServerUrl = options.trackServerUrl;
    this.shouldInlineStylesheet = options.shouldInlineStylesheet;
    this.version = options.version;
    this.performanceConfig = options.performanceConfig || DEFAULT_PERFORMANCE_CONFIG;
    this.storeType = options.storeType ?? 'memory';
    this.applyBackgroundColorToBlockedElements = options.applyBackgroundColorToBlockedElements ?? false;
    this.enableUrlChangePolling = options.enableUrlChangePolling ?? false;
    this.urlChangePollingInterval = options.urlChangePollingInterval ?? DEFAULT_URL_CHANGE_POLLING_INTERVAL;
    this.captureDocumentTitle = options.captureDocumentTitle ?? false;
    if (options.fullSnapshotIntervalMs !== undefined) {
      this.fullSnapshotIntervalMs = options.fullSnapshotIntervalMs;
    }

    // Auto-include .amp-unmask as a default unmaskSelector entry so it works
    // symmetrically with amp-mask/amp-block without requiring explicit config (SR-2945).
    this.privacyConfig = {
      ...(options.privacyConfig ?? {}),
      unmaskSelector: Array.from(new Set([`.${UNMASK_TEXT_CLASS}`, ...(options.privacyConfig?.unmaskSelector ?? [])])),
    };
    if (options.interactionConfig) {
      this.interactionConfig = options.interactionConfig;

      // validate ugcFilterRules, throw error if invalid - throw error at the beginning of the config
      if (this.interactionConfig.ugcFilterRules) {
        validateUGCFilterRules(this.interactionConfig.ugcFilterRules);
      }
    }
    if (options.debugMode) {
      this.debugMode = options.debugMode;
    }
    // Support both new useWebWorker and legacy experimental.useWebWorker for backwards compatibility
    if (options.useWebWorker !== undefined) {
      this.useWebWorker = options.useWebWorker;
    } else {
      const legacyOptions = options as { experimental?: { useWebWorker?: boolean } };
      if (legacyOptions.experimental?.useWebWorker !== undefined) {
        this.useWebWorker = legacyOptions.experimental.useWebWorker;
      }
    }
    this.captureAdoptedStyleSheets = options.captureAdoptedStyleSheets ?? true;
    if (options.crossOriginIframes) {
      this.crossOriginIframes = options.crossOriginIframes;
    }
    if (options.flushIntervalConfig) {
      this.flushIntervalConfig = sanitizeFlushIntervalConfig(options.flushIntervalConfig, this.loggerProvider);
    }
  }
}

// 100ms floor avoids degenerate configs (0/negative) that would split on every event.
// Customers wanting fewer requests should be raising the value, not lowering it; the floor
// is just a defensive guard against typos and unsigned-int rollovers.
const MIN_FLUSH_INTERVAL_FLOOR_MS = 100;

function sanitizeFlushIntervalConfig(raw: FlushIntervalConfig, loggerProvider: ILogger): FlushIntervalConfig {
  const sanitized: FlushIntervalConfig = {};
  if (raw.minIntervalMs !== undefined) {
    if (!Number.isFinite(raw.minIntervalMs) || raw.minIntervalMs < MIN_FLUSH_INTERVAL_FLOOR_MS) {
      loggerProvider.warn(
        `flushIntervalConfig.minIntervalMs ${raw.minIntervalMs} is below floor ${MIN_FLUSH_INTERVAL_FLOOR_MS}ms; clamping.`,
      );
      sanitized.minIntervalMs = MIN_FLUSH_INTERVAL_FLOOR_MS;
    } else {
      sanitized.minIntervalMs = raw.minIntervalMs;
    }
  }
  if (raw.maxIntervalMs !== undefined) {
    // Unlike min, `Infinity` is a meaningful value here: it means "no upper bound on interval
    // growth" (Math.min(Infinity, x) === x in BaseEventsStore.shouldSplitEventsList). Reject
    // only NaN and sub-floor values; pass Infinity through.
    if (Number.isNaN(raw.maxIntervalMs) || raw.maxIntervalMs < MIN_FLUSH_INTERVAL_FLOOR_MS) {
      loggerProvider.warn(
        `flushIntervalConfig.maxIntervalMs ${raw.maxIntervalMs} is below floor ${MIN_FLUSH_INTERVAL_FLOOR_MS}ms; clamping.`,
      );
      sanitized.maxIntervalMs = MIN_FLUSH_INTERVAL_FLOOR_MS;
    } else {
      sanitized.maxIntervalMs = raw.maxIntervalMs;
    }
  }
  // Cross-validate against the SDK's effective defaults so that a partial config (only one of
  // {minIntervalMs, maxIntervalMs}) doesn't get silently clamped by the unspecified default.
  // Concrete failure mode without this: customer sets only `minIntervalMs: 30_000`, the store's
  // `maxInterval` falls back to `MAX_INTERVAL = 10_000`, and `shouldSplitEventsList` then
  // caps the effective interval at 10s — silently negating the customer's tune-up.
  // The user-supplied value always wins; we fill in the other side to match.
  if (sanitized.minIntervalMs !== undefined || sanitized.maxIntervalMs !== undefined) {
    const effectiveMin = sanitized.minIntervalMs ?? MIN_INTERVAL;
    const effectiveMax = sanitized.maxIntervalMs ?? MAX_INTERVAL;
    if (effectiveMax < effectiveMin) {
      if (sanitized.maxIntervalMs === undefined) {
        loggerProvider.warn(
          `flushIntervalConfig.minIntervalMs (${effectiveMin}) exceeds the default maxIntervalMs (${MAX_INTERVAL}); raising max to match min.`,
        );
        sanitized.maxIntervalMs = effectiveMin;
      } else if (sanitized.minIntervalMs === undefined) {
        loggerProvider.warn(
          `flushIntervalConfig.maxIntervalMs (${effectiveMax}) is below the default minIntervalMs (${MIN_INTERVAL}); lowering min to match max.`,
        );
        sanitized.minIntervalMs = effectiveMax;
      } else {
        loggerProvider.warn(
          `flushIntervalConfig.maxIntervalMs (${sanitized.maxIntervalMs}) is less than minIntervalMs (${sanitized.minIntervalMs}); raising max to match min.`,
        );
        sanitized.maxIntervalMs = sanitized.minIntervalMs;
      }
    }
  }
  return sanitized;
}
