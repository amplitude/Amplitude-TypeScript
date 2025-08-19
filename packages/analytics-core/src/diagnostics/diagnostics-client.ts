/// <reference lib="dom" />
import { DiagnosticsStorage } from './diagnostics-storage';

// Maximum number of histogram items to store (queue size limit)
const MAX_HISTOGRAM_ITEMS = 65000;

// Flush interval: 1 hour in milliseconds
const FLUSH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Interfaces for data structures
interface DiagnosticsTag {
  [key: string]: string;
}

interface DiagnosticsCounter {
  [key: string]: number;
}

interface HistogramEntry {
  name: string;
  value: number;
  timestamp: number;
}

interface HistogramResult {
  count: number;
  min: number;
  max: number;
  avg: number;
  median: number;
  p95: number;
}

interface DiagnosticsHistogram {
  [key: string]: HistogramResult;
}

interface DiagnosticsEvent {
  event_name: string;
  time: number;
  event_properties: Record<string, any>;
}

interface FlushPayload {
  apiKey?: string;
  tags: DiagnosticsTag;
  histogram: DiagnosticsHistogram;
  counters: DiagnosticsCounter;
  events: DiagnosticsEvent[];
}

/**
 * Amplitude Diagnostics Client
 *
 * A client for collecting and managing diagnostics data including tags, counters,
 * histograms, and events. Data is stored persistently using IndexedDB to survive browser restarts and offline scenarios.
 *
 * Key Features:
 * - IndexedDB storage
 * - Queue size management (max 65,000 histogram items)
 * - Auto-flush when histogram limit is reached (prevents data loss)
 * - Time-based flush interval (1 hour since last flush)
 * - Histogram statistics calculation (min, max, avg, median, p95)
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
 * // Record performance metrics (auto-flushes at 65,000 items)
 * await diagnostics.recordHistogram('sr.time', 5.2);
 * await diagnostics.recordHistogram('network.latency', 150);
 *
 * // Record diagnostic events
 * await diagnostics.recordEvent('error', {
 *   stack_trace: '...',
 *   api_key: 'hidden'
 * });
 *
 * // Manual flush (auto-flushes every 1 hour or at 65,000 histogram items)
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
  recordEvent(name: string, properties: Record<string, any>): Promise<void>;

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
      // Check if we've hit the maximum limit and trigger auto-flush
      const currentCount = await this.storage.getHistogramRecordCount();
      if (currentCount >= MAX_HISTOGRAM_ITEMS) {
        try {
          // Trigger auto-flush to clear data and start fresh
          // Timer reset logic is handled inside _flush()
          await this._flush();
        } catch (flushError) {
          console.error('[Amplitude] DiagnosticsClient: Auto-flush failed', flushError);
          // If flush fails, we still need to add the record but should consider cleanup
          // For now, we'll still add the record - in production you might want to implement
          // a cleanup strategy here
        }
      }

      // Add the new record to IndexedDB
      await this.storage.addHistogramRecord(name, value);
    } catch (error) {
      console.error('[Amplitude] DiagnosticsClient: Failed to record histogram', error);
    }
  }

  async recordEvent(name: string, properties: Record<string, any>): Promise<void> {
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
      const tags: DiagnosticsTag = {};
      tagRecords.forEach((record) => {
        tags[record.key] = record.value;
      });

      const counters: DiagnosticsCounter = {};
      counterRecords.forEach((record) => {
        counters[record.key] = record.value;
      });

      // Convert histogram records to the legacy format for calculation
      const histogramEntries: HistogramEntry[] = histogramRecords.map((record) => ({
        name: record.key,
        value: record.value,
        timestamp: record.timestamp,
      }));

      // Calculate histogram results
      const histogram = this.calculateHistogramResults(histogramEntries);

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

  private calculateHistogramResults(entries: HistogramEntry[]): DiagnosticsHistogram {
    const histogramMap: { [name: string]: number[] } = {};

    // Group values by histogram name
    entries.forEach((entry) => {
      if (!histogramMap[entry.name]) {
        histogramMap[entry.name] = [];
      }
      histogramMap[entry.name].push(entry.value);
    });

    // Calculate statistics for each histogram
    const results: DiagnosticsHistogram = {};
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
      return { count: 0, min: 0, max: 0, avg: 0, median: 0, p95: 0 };
    }

    // Sort values for percentile calculations
    const sortedValues = [...values].sort((a, b) => a - b);
    const count = values.length;
    const min = sortedValues[0];
    const max = sortedValues[count - 1];
    const sum = values.reduce((acc, val) => acc + val, 0);
    const avg = sum / count;

    // Calculate median
    const median =
      count % 2 === 0
        ? (sortedValues[Math.floor(count / 2) - 1] + sortedValues[Math.floor(count / 2)]) / 2
        : sortedValues[Math.floor(count / 2)];

    // Calculate 95th percentile
    const p95Index = Math.ceil(count * 0.95) - 1;
    const p95 = sortedValues[Math.max(0, p95Index)];

    return {
      count,
      min,
      max,
      avg: Math.round(avg * 100) / 100, // Round to 2 decimal places
      median,
      p95,
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
