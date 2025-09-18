import { ILogger } from '../logger';
import { DiagnosticsStorage, IDiagnosticsStorage } from './diagnostics-storage';
import { ServerZoneType } from '../types/server-zone';
import { getGlobalScope } from '../global-scope';

export const SAVE_INTERVAL_MS = 1000; // 1 second
export const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const DIAGNOSTICS_US_SERVER_URL = 'https://diagnostics.prod.us-west-2.amplitude.com/v1/capture';
export const DIAGNOSTICS_EU_SERVER_URL = 'https://diagnostics.prod.eu-central-1.amplitude.com/v1/capture';

// In-memory storage limits
export const MAX_MEMORY_STORAGE_COUNT = 10000; // for tags, counters, histograms separately
export const MAX_MEMORY_STORAGE_EVENTS_COUNT = 10;

// === Core Data Types ===

/**
 * Key-value pairs for environment/context information
 */
type DiagnosticsTags = Record<string, string>;

/**
 * Numeric counters that can be incremented
 */
type DiagnosticsCounters = Record<string, number>;

/**
 * Properties for diagnostic events
 */
type EventProperties = Record<string, any>;

/**
 * Individual diagnostic event
 */
interface DiagnosticsEvent {
  readonly event_name: string;
  readonly time: number;
  readonly event_properties: EventProperties;
}

/**
 * Computed histogram statistics for final payload
 */
interface HistogramResult {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
}

/**
 * Internal histogram statistics with sum for efficient incremental updates
 */
export interface HistogramStats {
  count: number;
  min: number;
  max: number;
  sum: number; // Used for avg calculation
}

/**
 * Collection of histogram results keyed by histogram name
 */
type DiagnosticsHistograms = Record<string, HistogramResult>;

/**
 * Collection of histogram stats keyed by histogram name (internal use for memory + persistence storage)
 */
type DiagnosticsHistogramStats = Record<string, HistogramStats>;

// === Payload Types ===

/**
 * Complete diagnostics payload sent to backend
 */
interface FlushPayload {
  readonly tags: DiagnosticsTags;
  readonly histogram: DiagnosticsHistograms;
  readonly counters: DiagnosticsCounters;
  // TODO(AMP-139569)
  // readonly events: readonly DiagnosticsEvent[];
}

/**
 * Amplitude Diagnostics Client
 *
 * A client for collecting and managing diagnostics data including tags, counters,
 * histograms, and events. Data is stored persistently using IndexedDB to survive browser restarts and offline scenarios.
 *
 * Key Features:
 * - IndexedDB storage
 * - Time-based persistent storage flush interval (5 minutes since last flush)
 * - 1 second time-based memory storage flush to persistent storage
 * - Histogram statistics calculation (min, max, avg)
 */
export interface IDiagnosticsClient {
  /**
   * Set or update a tag
   *
   * @example
   * ```typescript
   * // Set environment tags
   * diagnostics.setTag('library', 'amplitude-typescript/2.0.0');
   * diagnostics.setTag('user_agent', navigator.userAgent);
   * ```
   */
  setTag(name: string, value: string): void;

  /**
   * Increment a counter. If doesn't exist, create a counter and set value to 1
   *
   * @example
   * ```typescript
   * // Track counters
   * diagnostics.increment('analytics.fileNotFound');
   * diagnostics.increment('network.retry', 3);
   * ```
   */
  increment(name: string, size?: number): void;

  /**
   * Record a histogram value
   *
   * @example
   * ```typescript
   * // Record performance metrics
   * diagnostics.recordHistogram('sr.time', 5.2);
   * diagnostics.recordHistogram('network.latency', 150);
   * ```
   */
  recordHistogram(name: string, value: number): void;

  /**
   * Record an event
   *
   * @example
   * ```typescript
   * // Record diagnostic events
   * diagnostics.recordEvent('error', {
   *   stack_trace: '...',
   * });
   * ```
   */
  // TODO(AMP-139569)
  // recordEvent(name: string, properties: EventProperties): void;

  // Flush storage
  _flush(): void;
}

export class DiagnosticsClient implements IDiagnosticsClient {
  storage?: IDiagnosticsStorage;
  logger: ILogger;
  serverUrl: string;
  apiKey: string;

  // In-memory storages
  inMemoryTags: DiagnosticsTags = {};
  inMemoryCounters: DiagnosticsCounters = {};
  inMemoryHistograms: DiagnosticsHistogramStats = {};
  inMemoryEvents: DiagnosticsEvent[] = [];

  // Timer for 1-second persistence
  saveTimer: ReturnType<typeof setTimeout> | null = null;
  // Timer for flush interval
  flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(apiKey: string, logger: ILogger, serverZone: ServerZoneType = 'US') {
    this.apiKey = apiKey;
    this.logger = logger;
    this.serverUrl = serverZone === 'US' ? DIAGNOSTICS_US_SERVER_URL : DIAGNOSTICS_EU_SERVER_URL;

    if (DiagnosticsStorage.isSupported()) {
      this.storage = new DiagnosticsStorage(apiKey, logger);
    } else {
      this.logger.debug('DiagnosticsClient: IndexedDB is not supported');
    }

    void this.initializeFlushInterval();
  }

  setTag(name: string, value: string) {
    if (!this.storage) {
      return;
    }

    if (Object.keys(this.inMemoryTags).length >= MAX_MEMORY_STORAGE_COUNT) {
      this.logger.debug('DiagnosticsClient: Early return setTags as reaching memory limit');
      return;
    }

    this.inMemoryTags[name] = value;
    this.startTimersIfNeeded();
  }

  increment(name: string, size = 1) {
    if (!this.storage) {
      return;
    }

    if (Object.keys(this.inMemoryCounters).length >= MAX_MEMORY_STORAGE_COUNT) {
      this.logger.debug('DiagnosticsClient: Early return increment as reaching memory limit');
      return;
    }

    this.inMemoryCounters[name] = (this.inMemoryCounters[name] || 0) + size;
    this.startTimersIfNeeded();
  }

  recordHistogram(name: string, value: number) {
    if (!this.storage) {
      return;
    }

    if (Object.keys(this.inMemoryHistograms).length >= MAX_MEMORY_STORAGE_COUNT) {
      this.logger.debug('DiagnosticsClient: Early return recordHistogram as reaching memory limit');
      return;
    }

    const existing = this.inMemoryHistograms[name];
    if (existing) {
      // Update existing stats incrementally
      existing.count += 1;
      existing.min = Math.min(existing.min, value);
      existing.max = Math.max(existing.max, value);
      existing.sum += value;
    } else {
      // Create new stats
      this.inMemoryHistograms[name] = {
        count: 1,
        min: value,
        max: value,
        sum: value,
      };
    }
    this.startTimersIfNeeded();
  }

  recordEvent(name: string, properties: EventProperties) {
    if (!this.storage) {
      return;
    }

    if (this.inMemoryEvents.length >= MAX_MEMORY_STORAGE_EVENTS_COUNT) {
      this.logger.debug('DiagnosticsClient: Early return recordEvent as reaching memory limit');
      return;
    }

    this.inMemoryEvents.push({
      event_name: name,
      time: Date.now(),
      event_properties: properties,
    });
    this.startTimersIfNeeded();
  }

  startTimersIfNeeded() {
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => {
        this.saveAllDataToStorage()
          .catch((error) => {
            this.logger.debug('DiagnosticsClient: Failed to save all data to storage', error);
          })
          .finally(() => {
            this.saveTimer = null;
          });
      }, SAVE_INTERVAL_MS);
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this._flush()
          .catch((error) => {
            this.logger.debug('DiagnosticsClient: Failed to flush', error);
          })
          .finally(() => {
            this.flushTimer = null;
          });
      }, FLUSH_INTERVAL_MS);
    }
  }

  async saveAllDataToStorage() {
    if (!this.storage) {
      return;
    }
    const tagsToSave = { ...this.inMemoryTags };
    const countersToSave = { ...this.inMemoryCounters };
    const histogramsToSave = { ...this.inMemoryHistograms };
    const eventsToSave = [...this.inMemoryEvents];

    this.inMemoryEvents = [];
    this.inMemoryTags = {};
    this.inMemoryCounters = {};
    this.inMemoryHistograms = {};

    await Promise.all([
      this.storage.setTags(tagsToSave),
      this.storage.incrementCounters(countersToSave),
      this.storage.setHistogramStats(histogramsToSave),
      this.storage.addEventRecords(eventsToSave),
    ]);
  }

  async _flush() {
    if (!this.storage) {
      return;
    }

    await this.saveAllDataToStorage();
    this.saveTimer = null;
    this.flushTimer = null;

    // Get all data from storage and clear it
    const {
      tags: tagRecords,
      counters: counterRecords,
      histogramStats: histogramStatsRecords,
      // TODO(AMP-139569)
      // events: eventRecords,
    } = await this.storage.getAllAndClear();

    // Update the last flush timestamp
    void this.storage.setLastFlushTimestamp(Date.now());

    // Convert metrics to the expected format
    const tags: DiagnosticsTags = {};
    tagRecords.forEach((record) => {
      tags[record.key] = record.value;
    });

    const counters: DiagnosticsCounters = {};
    counterRecords.forEach((record) => {
      counters[record.key] = record.value;
    });

    const histogram: DiagnosticsHistograms = {};
    histogramStatsRecords.forEach((stats) => {
      histogram[stats.key] = {
        count: stats.count,
        min: stats.min,
        max: stats.max,
        avg: Math.round((stats.sum / stats.count) * 100) / 100, // round the average to 2 decimal places.
      };
    });

    // TODO(AMP-139569)
    // const events: DiagnosticsEvent[] = eventRecords.map((record) => ({
    // const events: DiagnosticsEvent[] = [];
    //   event_name: record.event_name,
    //   time: record.time,
    //   event_properties: record.event_properties,
    // }));

    // Early return if all data collections are empty
    if (
      Object.keys(tags).length === 0 &&
      Object.keys(counters).length === 0 &&
      Object.keys(histogram).length === 0
      // TODO(AMP-139569)
      // && Object.keys(events).length === 0
    ) {
      return;
    }

    // Create flush payload
    const payload: FlushPayload = {
      tags,
      histogram,
      counters,
      // TODO(AMP-139569)
      // events,
    };

    // Send payload to diagnostics server
    void this.fetch(payload);
  }

  /**
   * Send diagnostics data to the server
   */
  async fetch(payload: FlushPayload) {
    try {
      if (!getGlobalScope()) {
        throw new Error('DiagnosticsClient: Fetch is not supported');
      }

      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers: {
          'X-ApiKey': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger.debug('DiagnosticsClient: Failed to send diagnostics data.');
        return;
      }

      this.logger.debug('DiagnosticsClient: Successfully sent diagnostics data');
    } catch (error) {
      this.logger.debug('DiagnosticsClient: Failed to send diagnostics data. ', error);
    }
  }

  /**
   * Initialize flush interval logic.
   * Check if 5 minutes has passed since last flush, if so flush immediately.
   * Otherwise set a timer to flush when the interval is reached.
   */
  async initializeFlushInterval() {
    if (!this.storage) {
      return;
    }
    const now = Date.now();
    const lastFlushTimestamp = (await this.storage.getLastFlushTimestamp()) || -1;
    const timeSinceLastFlush = now - lastFlushTimestamp;

    // If last flush timestamp is -1, it means this is a new client
    if (lastFlushTimestamp === -1) {
      return;
    } else if (timeSinceLastFlush >= FLUSH_INTERVAL_MS) {
      // More than 5 minutes has passed, flush immediately
      void this._flush();
      return;
    } else {
      // Set timer for remaining time
      const remainingTime = FLUSH_INTERVAL_MS - timeSinceLastFlush;
      this.flushTimer = setTimeout(() => {
        this._flush()
          .catch((error) => {
            this.logger.debug('DiagnosticsClient: Failed to flush', error);
          })
          .finally(() => {
            this.flushTimer = null;
          });
      }, remainingTime);
    }
  }
}
