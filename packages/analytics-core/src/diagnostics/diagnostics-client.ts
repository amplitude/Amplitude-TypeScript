/// <reference lib="dom" />
import { ILogger } from 'src/logger';
import { DiagnosticsStorage, IDiagnosticsStorage } from './diagnostics-storage';
import { ServerZoneType } from 'src/types/server-zone';

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
 * - 1 second time-based memory storage flush interval
 * - Histogram statistics calculation (min, max, avg)
 * - Thread-safe operations through async/await
 *
 * Usage:
 * ```typescript
 * // Create diagnostics client
 * const diagnostics = new DiagnosticsClient(apiKey);
 *
 * // Set environment tags
 * await diagnostics.setTag('library', 'amplitude-typescript/2.0.0');
 * await diagnostics.setTag('user_agent', navigator.userAgent);
 *
 * // Track counters
 * await diagnostics.increment('analytics.fileNotFound');
 * await diagnostics.increment('network.retry', 3);
 *
 * // Record performance metrics
 * await diagnostics.recordHistogram('sr.time', 5.2);
 * await diagnostics.recordHistogram('network.latency', 150);
 *
 * // Record diagnostic events
 * await diagnostics.recordEvent('error', {
 *   stack_trace: '...',
 * });
 *
 * // Manual flush (auto-flushes every 1 hour)
 * const payload = await diagnostics._flush();
 * // Send payload to diagnostics endpoint
 * ```
 */
export interface IDiagnosticsClient {
  // Set or update a tag
  setTag(name: string, value: string): Promise<void>;

  // Increment a counter. If doesn't exist, create a counter and set value to 1
  increment(name: string, size?: number): Promise<void>;

  // Record a histogram value
  recordHistogram(name: string, value: number): Promise<void>;

  // Record an event
  recordEvent(name: string, properties: EventProperties): Promise<void>;

  // Hide it from consumers but be able to be hooked to SDK flush()
  // Flush buffered data
  _flush(): Promise<FlushPayload>;
}

export class DiagnosticsClient implements IDiagnosticsClient {
  private storage: IDiagnosticsStorage;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private logger?: ILogger;
  private serverUrl: string;
  private apiKey: string;

  // In-memory storages
  private inMemoryTags: DiagnosticsTags = {};
  private inMemoryCounters: DiagnosticsCounters = {};
  private inMemoryHistograms: DiagnosticsHistogramStats = {};
  private inMemoryEvents: DiagnosticsEvent[] = [];

  // Global timer for 1-second persistence
  private globalSaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(apiKey: string, logger?: ILogger, serverZone: ServerZoneType = 'US') {
    this.apiKey = apiKey;
    this.logger = logger;
    this.serverUrl = serverZone === 'US' ? US_SERVER_URL : EU_SERVER_URL;
    this.storage = new DiagnosticsStorage(apiKey, logger);
    void this.initializeFlushInterval();
  }

  async setTag(name: string, value: string): Promise<void> {
    this.inMemoryTags[name] = value;
    this.startSaveTimerIfNeeded();
  }

  async increment(name: string, size = 1): Promise<void> {
    this.inMemoryCounters[name] = (this.inMemoryCounters[name] || 0) + size;
    this.startSaveTimerIfNeeded();
  }

  async recordHistogram(name: string, value: number): Promise<void> {
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

  async recordEvent(name: string, properties: EventProperties): Promise<void> {
    this.inMemoryEvents.push({
      event_name: name,
      time: Date.now(),
      event_properties: properties,
    });
    this.startSaveTimerIfNeeded();
  }

  private startSaveTimerIfNeeded(): void {
    if (!this.globalSaveTimer) {
      this.globalSaveTimer = setTimeout(() => {
        void this.saveAllDataToStorage();
      }, 1000); // Save every 1 second
    }
  }

  private async saveAllDataToStorage(): Promise<void> {
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
      this.globalSaveTimer = null;

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

  async _flush(): Promise<FlushPayload> {
    try {
      // Clear the current timer since we're flushing now
      this.clearFlushTimer();

      // Get all stored data from IndexedDB
      const tagRecords = await this.storage.getAllTags();
      const counterRecords = await this.storage.getAllCounters();
      const histogramStatsRecords = await this.storage.getAllHistogramStats();
      const eventRecords = await this.storage.getAllEventRecords();

      // Convert records to the expected format
      const tags: DiagnosticsTags = {};
      tagRecords.forEach((record) => {
        tags[record.key] = record.value;
      });

      const counters: DiagnosticsCounters = {};
      counterRecords.forEach((record) => {
        counters[record.key] = record.value;
      });

      // Convert histogram stats to histogram results
      const histogram: DiagnosticsHistograms = {};
      histogramStatsRecords.forEach((stats) => {
        histogram[stats.key] = {
          count: stats.count,
          min: stats.min,
          max: stats.max,
          avg: stats.count > 0 ? Math.round((stats.sum / stats.count) * 100) / 100 : 0,
        };
      });

      // Convert event records to the expected format
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
      await this.fetch(payload);

      // Clear all data after successful flush
      await this.clearAllData();

      // Clear in-memory data
      this.clearAllInMemoryData();

      // Update the last flush timestamp
      await this.storage.setLastFlushTimestamp(Date.now());

      // Set timer for next flush interval
      this.setFlushTimer(FLUSH_INTERVAL_MS);

      return payload;
    } catch (error) {
      this.logger?.error('DiagnosticsClient: Failed to flush data', error);
      // Return empty payload on error
      return {
        tags: {},
        histogram: {},
        counters: {},
        events: [],
      };
    }
  }

  /**
   * Send diagnostics data to the server
   */
  private async fetch(payload: FlushPayload): Promise<void> {
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

  private clearAllInMemoryData(): void {
    this.inMemoryTags = {};
    this.inMemoryCounters = {};
    this.inMemoryHistograms = {};
    this.inMemoryEvents = [];

    // Clear the global save timer
    if (this.globalSaveTimer) {
      clearTimeout(this.globalSaveTimer);
      this.globalSaveTimer = null;
    }
  }

  private async clearAllData(): Promise<void> {
    try {
      await this.storage.clearAllData();
    } catch (error) {
      this.logger?.debug('DiagnosticsClient: Failed to clear data', error);
    }
  }

  /**
   * Initialize flush interval logic.
   * Check if 5 minutes has passed since last flush, if so flush immediately.
   * Otherwise set a timer to flush when the interval is reached.
   */
  private async initializeFlushInterval(): Promise<void> {
    try {
      const now = Date.now();
      const lastFlushTimestamp = (await this.storage.getLastFlushTimestamp()) || now;
      const timeSinceLastFlush = now - lastFlushTimestamp;

      if (timeSinceLastFlush >= FLUSH_INTERVAL_MS) {
        // More than 5 minutes has passed, flush immediately
        await this.flushAndUpdateTimestamp();
      } else {
        // Set timer for remaining time
        const remainingTime = FLUSH_INTERVAL_MS - timeSinceLastFlush;
        this.setFlushTimer(remainingTime);
      }
    } catch (error) {
      this.logger?.debug('DiagnosticsClient: Failed to initialize flush interval', error);
    }
  }

  /**
   * Set a timer to flush after the specified delay
   */
  private setFlushTimer(delayMs: number): void {
    this.clearFlushTimer();
    this.flushTimer = setTimeout(() => {
      void this.flushAndUpdateTimestamp();
    }, delayMs);
  }

  /**
   * Clear the current flush timer
   */
  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Flush data and update timestamp, then set next timer
   */
  private async flushAndUpdateTimestamp(): Promise<void> {
    try {
      // Perform the flush (timer reset logic is handled inside _flush())
      await this._flush();
    } catch (error) {
      this.logger?.debug('DiagnosticsClient: Failed to flush and update timestamp', error);
    }
  }

  // Utility method to get current data for debugging (not part of interface)
  async _getCurrentData() {
    // Ensure latest data is saved to storage first
    await this.saveAllDataToStorage();

    return {
      tags: await this.storage.getAllTags(),
      counters: await this.storage.getAllCounters(),
      histogramStats: await this.storage.getAllHistogramStats(),
      events: await this.storage.getAllEventRecords(),
      inMemoryTags: this.inMemoryTags,
      inMemoryCounters: this.inMemoryCounters,
      inMemoryHistograms: this.inMemoryHistograms,
      inMemoryEvents: this.inMemoryEvents,
    };
  }

  // Utility method to get current histogram stats for a specific key
  _getHistogramStats(key: string): HistogramStats | undefined {
    return this.inMemoryHistograms[key];
  }
}
