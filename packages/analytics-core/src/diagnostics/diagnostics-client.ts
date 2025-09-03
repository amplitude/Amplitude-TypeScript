/// <reference lib="dom" />
import { DiagnosticsStorage } from './diagnostics-storage';

// Flush interval: 1 hour in milliseconds
const FLUSH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour


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

// === Histogram Types ===

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
 * - Time-based persistent storage flush interval (1 hour since last flush)
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
 *   api_key: 'hidden'
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
  private storage: DiagnosticsStorage;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(apiKey: string) {
    this.storage = new DiagnosticsStorage(apiKey);
    void this.initializeFlushInterval();
  }

  async setTag(name: string, value: string): Promise<void> {
    try {
      await this.storage.setTag(name, value);
    } catch (error) {
      console.error('[Amplitude] DiagnosticsClient: Failed to set tag', error);
    }
  }

  async increment(name: string, size = 1): Promise<void> {
    try {
      // Get existing counter or create new one
      const existingCounter = await this.storage.getCounter(name);
      const currentValue = existingCounter ? existingCounter.value : 0;

      await this.storage.setCounter(name, currentValue + size);
    } catch (error) {
      console.error('[Amplitude] DiagnosticsClient: Failed to increment counter', error);
    }
  }

  async recordHistogram(name: string, value: number): Promise<void> {
    try {
      // Add the new record to IndexedDB
      await this.storage.addHistogramRecord(name, value);
    } catch (error) {
      console.error('[Amplitude] DiagnosticsClient: Failed to record histogram', error);
    }
  }

  async recordEvent(name: string, properties: EventProperties): Promise<void> {
    try {
      await this.storage.addEventRecord(name, properties);
    } catch (error) {
      console.error('[Amplitude] DiagnosticsClient: Failed to record event', error);
    }
  }

  async _flush(): Promise<FlushPayload> {
    try {
      // Clear the current timer since we're flushing now
      this.clearFlushTimer();

      // Get all stored data from IndexedDB
      const tagRecords = await this.storage.getAllTags();
      const counterRecords = await this.storage.getAllCounters();
      const histogramRecords = await this.storage.getAllHistogramRecords();
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

      // Calculate histogram results from records
      const histogram = this.calculateHistogramResults(histogramRecords);

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

      // Clear all data after successful flush preparation
      await this.clearAllData();

      // Update the last flush timestamp
      await this.storage.setLastFlushTimestamp(Date.now());

      // Set timer for next flush interval
      this.setFlushTimer(FLUSH_INTERVAL_MS);

      return payload;
    } catch (error) {
      console.error('[Amplitude] DiagnosticsClient: Failed to flush data', error);
      // Return empty payload on error
      return {
        tags: {},
        histogram: {},
        counters: {},
        events: [],
      };
    }
  }

  private calculateHistogramResults(records: Array<{key: string, value: number}>): DiagnosticsHistograms {
    const histogramMap: { [name: string]: number[] } = {};

    // Group values by histogram name
    records.forEach((record) => {
      if (!histogramMap[record.key]) {
        histogramMap[record.key] = [];
      }
      histogramMap[record.key].push(record.value);
    });

    // Calculate statistics for each histogram
    const results: DiagnosticsHistograms = {};
    Object.keys(histogramMap).forEach((name) => {
      const values = histogramMap[name];
      if (values.length > 0) {
        results[name] = this.calculateStatistics(values);
      }
    });

    return results;
  }

  private calculateStatistics(values: number[]): HistogramResult {
    if (values.length === 0) {
      return { count: 0, min: 0, max: 0, avg: 0 };
    }

    const sortedValues = [...values].sort((a, b) => a - b);
    const count = values.length;
    const min = sortedValues[0];
    const max = sortedValues[count - 1];
    const sum = values.reduce((acc, val) => acc + val, 0);
    const avg = Math.round((sum / count) * 100) / 100; // Round to 2 decimal places

    return {
      count,
      min,
      max,
      avg,
    };
  }

  private async clearAllData(): Promise<void> {
    try {
      await this.storage.clearAllData();
    } catch (error) {
      console.error('[Amplitude] DiagnosticsClient: Failed to clear data', error);
    }
  }

  /**
   * Initialize flush interval logic.
   * Check if 1 hour has passed since last flush, if so flush immediately.
   * Otherwise set a timer to flush when the interval is reached.
   */
  private async initializeFlushInterval(): Promise<void> {
    try {
      const lastFlushTimestamp = await this.storage.getLastFlushTimestamp();
      const now = Date.now();

      if (!lastFlushTimestamp) {
        // First time - flush immediately to establish initial timestamp
        await this.flushAndUpdateTimestamp();
        return;
      }

      const timeSinceLastFlush = now - lastFlushTimestamp;

      if (timeSinceLastFlush >= FLUSH_INTERVAL_MS) {
        // More than 1 hour has passed, flush immediately
        await this.flushAndUpdateTimestamp();
      } else {
        // Set timer for remaining time
        const remainingTime = FLUSH_INTERVAL_MS - timeSinceLastFlush;
        this.setFlushTimer(remainingTime);
      }
    } catch (error) {
      console.error('[Amplitude] DiagnosticsClient: Failed to initialize flush interval', error);
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
      console.error('[Amplitude] DiagnosticsClient: Failed to flush and update timestamp', error);
      // Set timer for retry on error
      this.setFlushTimer(FLUSH_INTERVAL_MS);
    }
  }

  // Utility method to get current data for debugging (not part of interface)
  async _getCurrentData() {
    return {
      tags: await this.storage.getAllTags(),
      counters: await this.storage.getAllCounters(),
      histogramEntries: await this.storage.getAllHistogramRecords(),
      events: await this.storage.getAllEventRecords(),
    };
  }

  // Utility method to get histogram values for a specific key, sorted by value
  // This leverages the compound index [key, value] for efficient querying
  async _getHistogramValuesSorted(key: string): Promise<number[]> {
    try {
      const records = await this.storage.getHistogramRecordsSortedByValue(key);
      return records.map((record) => record.value);
    } catch (error) {
      console.error('[Amplitude] DiagnosticsClient: Failed to get sorted histogram values', error);
      return [];
    }
  }
}
