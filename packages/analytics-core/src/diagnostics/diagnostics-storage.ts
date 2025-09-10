/// <reference lib="dom" />
import { ILogger } from '../logger';

// Database configuration
const DB_VERSION = 1;

// Table names for different diagnostics types
export const TABLE_NAMES = {
  TAGS: 'tags',
  COUNTERS: 'counters',
  HISTOGRAMS: 'histograms',
  EVENTS: 'events',
  INTERNAL: 'internal', // New table for internal storage like flush timestamps
} as const;

// Keys for internal storage table
export const INTERNAL_KEYS = {
  LAST_FLUSH_TIMESTAMP: 'last_flush_timestamp',
} as const;

// Record interfaces for each table
export interface TagRecord {
  key: string;
  value: string;
}

export interface CounterRecord {
  key: string;
  value: number;
}

export interface HistogramRecord {
  key: string;
  count: number;
  min: number;
  max: number;
  sum: number;
}

export interface EventRecord {
  id?: number; // Auto-increment primary key
  event_name: string;
  time: number;
  event_properties: Record<string, any>;
}

export interface InternalRecord {
  key: string;
  value: string;
}

export interface IDiagnosticsStorage {
  /**
   * Set multiple tags in a single transaction (batch operation)
   * Promise never rejects - errors are logged and operation continues gracefully
   */
  setTags(tags: Record<string, string>): Promise<void>;
  /**
   * Increment multiple counters in a single transaction (batch operation)
   * Uses read-modify-write pattern to accumulate with existing values
   * Promise never rejects - errors are logged and operation continues gracefully
   */
  incrementCounters(counters: Record<string, number>): Promise<void>;
  /**
   * Set multiple histogram stats in a single transaction (batch operation)
   * Uses read-modify-write pattern to accumulate count/sum and update min/max with existing values
   * Promise never rejects - errors are logged and operation continues gracefully
   */
  setHistogramStats(
    histogramStats: Record<string, { count: number; min: number; max: number; sum: number }>,
  ): Promise<void>;
  /**
   * Add multiple event records in a single transaction (batch operation)
   * Promise never rejects - errors are logged and operation continues gracefully
   */
  addEventRecords(
    events: Array<{ event_name: string; time: number; event_properties: Record<string, any> }>,
  ): Promise<void>;

  setLastFlushTimestamp(timestamp: number): Promise<void>;

  getLastFlushTimestamp(): Promise<number | undefined>;

  /**
   * Get all data except internal data from storage and clear it
   */
  getAllAndClear(): Promise<{
    tags: TagRecord[];
    counters: CounterRecord[];
    histogramStats: HistogramRecord[];
    events: EventRecord[];
  }>;
}

/**
 * Purpose-specific IndexedDB storage for diagnostics data
 * Provides optimized methods for each type of diagnostics data
 */
export class DiagnosticsStorage implements IDiagnosticsStorage {
  dbPromise: Promise<IDBDatabase> | null = null;
  dbName: string;
  logger: ILogger;

  constructor(apiKey: string, logger: ILogger) {
    this.logger = logger;
    this.dbName = `AMP_diagnostics_${apiKey.substring(0, 10)}`;
  }

  async getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = this.openDB();
    }
    return this.dbPromise;
  }

  openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not supported'));
        return;
      }

      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createTables(db);
      };
    });
  }

  createTables(db: IDBDatabase): void {
    // Create tags table
    if (!db.objectStoreNames.contains(TABLE_NAMES.TAGS)) {
      db.createObjectStore(TABLE_NAMES.TAGS, { keyPath: 'key' });
    }

    // Create counters table
    if (!db.objectStoreNames.contains(TABLE_NAMES.COUNTERS)) {
      db.createObjectStore(TABLE_NAMES.COUNTERS, { keyPath: 'key' });
    }

    // Create histograms table for storing histogram stats (count, min, max, sum)
    if (!db.objectStoreNames.contains(TABLE_NAMES.HISTOGRAMS)) {
      db.createObjectStore(TABLE_NAMES.HISTOGRAMS, {
        keyPath: 'key',
      });
    }

    // Create events table
    if (!db.objectStoreNames.contains(TABLE_NAMES.EVENTS)) {
      const eventsStore = db.createObjectStore(TABLE_NAMES.EVENTS, {
        keyPath: 'id',
        autoIncrement: true,
      });

      // Create index on time for chronological queries
      eventsStore.createIndex('time_idx', 'time', { unique: false });
    }

    // Create internal table for storing internal data like flush timestamps
    if (!db.objectStoreNames.contains(TABLE_NAMES.INTERNAL)) {
      db.createObjectStore(TABLE_NAMES.INTERNAL, { keyPath: 'key' });
    }
  }

  async setTags(tags: Record<string, string>): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.TAGS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.TAGS);

      return new Promise((resolve) => {
        let completed = 0;
        const entries = Object.entries(tags);

        if (entries.length === 0) {
          resolve();
          return;
        }

        const handleCompletion = () => {
          completed++;
          if (completed === entries.length) {
            resolve();
          }
        };

        entries.forEach(([key, value]) => {
          const request = store.put({ key, value });

          request.onsuccess = handleCompletion;

          request.onerror = () => {
            this.logger.debug('DiagnosticsStorage: Failed to set tag', key, value);
            handleCompletion();
          };
        });
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to set tags', error);
    }
  }

  async incrementCounters(counters: Record<string, number>): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.COUNTERS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.COUNTERS);

      return new Promise((resolve) => {
        const entries = Object.entries(counters);

        if (entries.length === 0) {
          resolve();
          return;
        }

        let pendingReads = entries.length;
        let pendingWrites = 0;
        const updatedCounters: Record<string, number> = {};

        const handleWriteCompletion = () => {
          pendingWrites--;
          if (pendingWrites === 0) {
            resolve();
          }
        };

        const startWritePhase = () => {
          // All reads complete, now write the updated values
          pendingWrites = entries.length;

          entries.forEach(([key]) => {
            const putRequest = store.put({ key, value: updatedCounters[key] });

            putRequest.onsuccess = handleWriteCompletion;

            putRequest.onerror = () => {
              this.logger.debug('DiagnosticsStorage: Failed to increment counter', key);
              handleWriteCompletion();
            };
          });
        };

        // First, read all existing values
        entries.forEach(([key, incrementValue]) => {
          const getRequest = store.get(key);

          getRequest.onsuccess = () => {
            const existingRecord = getRequest.result as CounterRecord | undefined;
            const existingValue = existingRecord ? existingRecord.value : 0;
            updatedCounters[key] = existingValue + incrementValue;

            pendingReads--;
            if (pendingReads === 0) {
              startWritePhase();
            }
          };

          getRequest.onerror = () => {
            this.logger.debug('DiagnosticsStorage: Failed to read existing counter', key);
            // Use fallback value for this counter
            updatedCounters[key] = incrementValue;

            pendingReads--;
            if (pendingReads === 0) {
              startWritePhase();
            }
          };
        });
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to increment counters', error);
    }
  }

  async setHistogramStats(
    histogramStats: Record<string, { count: number; min: number; max: number; sum: number }>,
  ): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.HISTOGRAMS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.HISTOGRAMS);

      return new Promise((resolve) => {
        const entries = Object.entries(histogramStats);

        if (entries.length === 0) {
          resolve();
          return;
        }

        let pendingReads = entries.length;
        let pendingWrites = 0;
        const updatedHistograms: Record<string, HistogramRecord> = {};

        const handleWriteCompletion = () => {
          pendingWrites--;
          if (pendingWrites === 0) {
            resolve();
          }
        };

        const startWritePhase = () => {
          // All reads complete, now write the updated values
          pendingWrites = entries.length;

          entries.forEach(([key]) => {
            const stats = updatedHistograms[key];
            const putRequest = store.put(stats);

            putRequest.onsuccess = handleWriteCompletion;

            putRequest.onerror = () => {
              this.logger.debug('DiagnosticsStorage: Failed to set histogram stats', key);
              handleWriteCompletion();
            };
          });
        };

        // First, read all existing values
        entries.forEach(([key, newStats]) => {
          const getRequest = store.get(key);

          getRequest.onsuccess = () => {
            const existingRecord = getRequest.result as HistogramRecord | undefined;

            if (existingRecord) {
              // Accumulate with existing stats
              updatedHistograms[key] = {
                key,
                count: existingRecord.count + newStats.count,
                min: Math.min(existingRecord.min, newStats.min),
                max: Math.max(existingRecord.max, newStats.max),
                sum: existingRecord.sum + newStats.sum,
              };
            } else {
              // Create new stats
              updatedHistograms[key] = {
                key,
                count: newStats.count,
                min: newStats.min,
                max: newStats.max,
                sum: newStats.sum,
              };
            }

            pendingReads--;
            if (pendingReads === 0) {
              startWritePhase();
            }
          };

          getRequest.onerror = () => {
            this.logger.debug('DiagnosticsStorage: Failed to read existing histogram stats', key);
            // Use new stats as fallback
            updatedHistograms[key] = {
              key,
              count: newStats.count,
              min: newStats.min,
              max: newStats.max,
              sum: newStats.sum,
            };

            pendingReads--;
            if (pendingReads === 0) {
              startWritePhase();
            }
          };
        });
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to set histogram stats', error);
    }
  }

  // === BATCH EVENT OPERATIONS ===

  /**
   * Add multiple event records in a single transaction (batch operation)
   * Promise never rejects - errors are logged and operation continues gracefully
   */
  async addEventRecords(
    events: Array<{ event_name: string; time: number; event_properties: Record<string, any> }>,
  ): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.EVENTS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.EVENTS);

      return new Promise((resolve) => {
        let completed = 0;

        if (events.length === 0) {
          resolve();
          return;
        }

        const handleCompletion = () => {
          completed++;
          if (completed === events.length) {
            resolve();
          }
        };

        events.forEach((event) => {
          const request = store.add({
            event_name: event.event_name,
            event_properties: event.event_properties,
            time: event.time,
          });

          request.onsuccess = handleCompletion;

          request.onerror = () => {
            this.logger.debug('DiagnosticsStorage: Failed to add event record', event.event_name);
            handleCompletion();
          };
        });
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to add event records', error);
      return Promise.resolve();
    }
  }

  async setInternal(key: string, value: string): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.INTERNAL], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.INTERNAL);

      return new Promise((resolve, reject) => {
        const request = store.put({ key, value });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to set internal value'));
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to set internal value', error);
    }
  }

  async getInternal(key: string): Promise<InternalRecord | undefined> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.INTERNAL], 'readonly');
      const store = transaction.objectStore(TABLE_NAMES.INTERNAL);

      return new Promise((resolve, reject) => {
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result as InternalRecord | undefined);
        request.onerror = () => reject(new Error('Failed to get internal value'));
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to get internal value', error);
      return undefined;
    }
  }

  async getLastFlushTimestamp(): Promise<number | undefined> {
    try {
      const record = await this.getInternal(INTERNAL_KEYS.LAST_FLUSH_TIMESTAMP);
      return record ? parseInt(record.value, 10) : undefined;
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to get last flush timestamp', error);
      return undefined;
    }
  }

  async setLastFlushTimestamp(timestamp: number): Promise<void> {
    try {
      await this.setInternal(INTERNAL_KEYS.LAST_FLUSH_TIMESTAMP, timestamp.toString());
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to set last flush timestamp', error);
    }
  }

  clearTable(transaction: IDBTransaction, tableName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = transaction.objectStore(tableName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to clear table ${tableName}`));
    });
  }

  async getAllAndClear(): Promise<{
    tags: TagRecord[];
    counters: CounterRecord[];
    histogramStats: HistogramRecord[];
    events: EventRecord[];
  }> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction(
        [TABLE_NAMES.TAGS, TABLE_NAMES.COUNTERS, TABLE_NAMES.HISTOGRAMS, TABLE_NAMES.EVENTS],
        'readwrite',
      );

      // Get all data first
      const [tags, counters, histogramStats, events] = await Promise.all([
        this.getAllFromStore<TagRecord>(transaction, TABLE_NAMES.TAGS),
        this.getAllFromStore<CounterRecord>(transaction, TABLE_NAMES.COUNTERS),
        this.getAllFromStore<HistogramRecord>(transaction, TABLE_NAMES.HISTOGRAMS),
        this.getAllFromStore<EventRecord>(transaction, TABLE_NAMES.EVENTS),
      ]);

      // Clear all data in the same transaction
      await Promise.all([
        this.clearTable(transaction, TABLE_NAMES.TAGS),
        this.clearTable(transaction, TABLE_NAMES.COUNTERS),
        this.clearTable(transaction, TABLE_NAMES.HISTOGRAMS),
        this.clearTable(transaction, TABLE_NAMES.EVENTS),
      ]);

      return { tags, counters, histogramStats, events };
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to get all and clear data', error);
      return { tags: [], counters: [], histogramStats: [], events: [] };
    }
  }

  /**
   * Helper method to get all records from a store within a transaction
   */
  private getAllFromStore<T>(transaction: IDBTransaction, tableName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const store = transaction.objectStore(tableName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(new Error(`Failed to get all from ${tableName}`));
    });
  }
}
