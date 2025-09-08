/// <reference lib="dom" />
import { ILogger } from 'src/logger';
import { DiagnosticsStorage, IDiagnosticsStorage } from './diagnostics-storage';
import { ServerZoneType } from 'src/types/server-zone';

const SAVE_INTERVAL_MS = 1000; // 1 second
const FLUSH_INTERVAL_MS = 5 * 1000; // 5 minutes
const US_SERVER_URL = 'https://diagnostics.prod.us-west-2.amplitude.com/v1/capture';
const EU_SERVER_URL = 'https://diagnostics.prod.eu-central-1.amplitude.com/v1/capture';

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
interface HistogramStats {
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
  readonly apiKey?: string;
  readonly tags: DiagnosticsTags;
  readonly histogram: DiagnosticsHistograms;
  readonly counters: DiagnosticsCounters;
  readonly events: readonly DiagnosticsEvent[];
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
  recordEvent(name: string, properties: EventProperties): void;

  // Flush storage
  _flush(): void;
}

export class DiagnosticsClient implements IDiagnosticsClient {
  storage: IDiagnosticsStorage;
  logger?: ILogger;
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
    this.serverUrl = serverZone === 'US' ? US_SERVER_URL : EU_SERVER_URL;
    this.storage = new DiagnosticsStorage(apiKey, logger);
    void this.initializeFlushInterval();
  }

  setTag(name: string, value: string) {
    this.inMemoryTags[name] = value;
    this.startSaveTimerIfNeeded();
  }

  increment(name: string, size = 1) {
    this.inMemoryCounters[name] = (this.inMemoryCounters[name] || 0) + size;
    this.startSaveTimerIfNeeded();
  }

  recordHistogram(name: string, value: number) {
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
    this.startSaveTimerIfNeeded();
  }

  recordEvent(name: string, properties: EventProperties) {
    this.inMemoryEvents.push({
      event_name: name,
      time: Date.now(),
      event_properties: properties,
    });
    this.startSaveTimerIfNeeded();
  }

  startSaveTimerIfNeeded() {
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => {
        void this.saveAllDataToStorage();
      }, SAVE_INTERVAL_MS);
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        void this.flushAndUpdateTimestamp();
      }, FLUSH_INTERVAL_MS);
    }
  }

  async saveAllDataToStorage() {
    try {
      // Make copies and clear immediately to avoid race conditions
      const tagsToSave = { ...this.inMemoryTags };
      const countersToSave = { ...this.inMemoryCounters };
      const histogramsToSave = { ...this.inMemoryHistograms };
      const eventsToSave = [...this.inMemoryEvents];

      // Clear in-memory data immediately
      this.inMemoryEvents = [];
      this.inMemoryTags = {};
      this.inMemoryCounters = {};
      this.inMemoryHistograms = {};

      // Clear the timer since we're processing the data
      this.saveTimer = null;

      await Promise.all([
        this.storage.setTags(tagsToSave),
        this.storage.setCounters(countersToSave),
        this.storage.setHistogramStats(histogramsToSave),
        this.storage.addEventRecords(eventsToSave),
      ]);
    } catch (error) {
      this.logger?.error('DiagnosticsClient: Failed to save data to storage', error);
    }
  }

  _flush() {
    // Clear the current timer since we're flushing now
    this.clearFlushTimer();

    // Perform flush operations asynchronously without blocking
    void this.performFlushOperations();
  }

  async performFlushOperations() {
    try {
      // Get all data from storage and clear it
      const {
        tags: tagRecords,
        counters: counterRecords,
        histogramStats: histogramStatsRecords,
        events: eventRecords,
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
          avg: stats.count > 0 ? Math.round((stats.sum / stats.count) * 100) / 100 : 0,
        };
      });

      const events: DiagnosticsEvent[] = eventRecords.map((record) => ({
        event_name: record.event_name,
        time: record.time,
        event_properties: record.event_properties,
      }));

      // Create flush payload
      const payload: FlushPayload = {
        tags,
        histogram,
        counters,
        events,
      };

      // Send payload to diagnostics server
      void this.fetch(payload);
    } catch (error) {
      this.logger?.error('DiagnosticsClient: Failed to flush data', error);
    }
  }

  /**
   * Send diagnostics data to the server
   */
  async fetch(payload: FlushPayload) {
    try {
      const response = await fetch(this.serverUrl, {
        method: 'POST',
        headers: {
          'X-ApiKey': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        this.logger?.debug(
          `DiagnosticsClient: Failed to send diagnostics data. HTTP ${response.status}: ${response.statusText}`,
        );
        return;
      }

      this.logger?.debug('DiagnosticsClient: Successfully sent diagnostics data');
    } catch (error) {
      this.logger?.debug('DiagnosticsClient: Failed to send diagnostics data', error);
    }
  }

  /**
   * Initialize flush interval logic.
   * Check if 5 minutes has passed since last flush, if so flush immediately.
   * Otherwise set a timer to flush when the interval is reached.
   */
  async initializeFlushInterval() {
    try {
      const now = Date.now();
      const lastFlushTimestamp = (await this.storage.getLastFlushTimestamp()) || -1;
      const timeSinceLastFlush = now - lastFlushTimestamp;

      // If last flush timestamp is -1, it means this is a new client
      if (lastFlushTimestamp === -1) {
        return;
      } else if (timeSinceLastFlush >= FLUSH_INTERVAL_MS) {
        // More than 5 minutes has passed, flush immediately
        await this.flushAndUpdateTimestamp();
      } else {
        // Set timer for remaining time
        const remainingTime = FLUSH_INTERVAL_MS - timeSinceLastFlush;
        this.flushTimer = setTimeout(() => {
          void this.flushAndUpdateTimestamp();
        }, remainingTime);
      }
    } catch (error) {
      this.logger?.debug('DiagnosticsClient: Failed to initialize flush interval', error);
    }
  }

  /**
   * Clear the current flush timer
   */
  clearFlushTimer() {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Flush data and update timestamp, then set next timer
   */
  async flushAndUpdateTimestamp() {
    try {
      // Perform the flush (timer reset logic is handled inside _flush())
      this._flush();
    } catch (error) {
      this.logger?.debug('DiagnosticsClient: Failed to flush and update timestamp', error);
    }
  }
}
