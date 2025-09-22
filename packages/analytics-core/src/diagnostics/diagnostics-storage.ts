import { getGlobalScope } from '../global-scope';
import { ILogger } from '../logger';
import { HistogramStats } from './diagnostics-client';

const MAX_PERSISTENT_STORAGE_EVENTS_COUNT = 10;

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

  /**
   * Check if IndexedDB is supported in the current environment
   * @returns true if IndexedDB is available, false otherwise
   */
  static isSupported(): boolean {
    return getGlobalScope()?.indexedDB !== undefined;
  }

  async getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = this.openDB();
    }
    return this.dbPromise;
  }

  openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onerror = () => {
        // Clear dbPromise when it rejects for the first time
        this.dbPromise = null;
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        const db = request.result;
        // Clear dbPromise when connection was on but went off later
        db.onclose = () => {
          this.dbPromise = null;
          this.logger.debug('DiagnosticsStorage: DB connection closed.');
        };

        db.onerror = (event) => {
          this.logger.debug('DiagnosticsStorage: A global database error occurred.', event);
          db.close();
        };
        resolve(db);
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
      if (Object.entries(tags).length === 0) {
        return;
      }

      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.TAGS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.TAGS);

      return new Promise((resolve) => {
        const entries = Object.entries(tags);

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onabort = (event) => {
          this.logger.debug('DiagnosticsStorage: Failed to set tags', event);
          resolve();
        };

        entries.forEach(([key, value]) => {
          const putRequest = store.put({ key, value });

          putRequest.onerror = (event) => {
            this.logger.debug('DiagnosticsStorage: Failed to set tag', key, value, event);
          };
        });
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to set tags', error);
    }
  }

  async incrementCounters(counters: Record<string, number>): Promise<void> {
    try {
      if (Object.entries(counters).length === 0) {
        return;
      }

      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.COUNTERS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.COUNTERS);

      return new Promise((resolve) => {
        const entries = Object.entries(counters);

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onabort = (event) => {
          this.logger.debug('DiagnosticsStorage: Failed to increment counters', event);
          resolve();
        };

        // Read existing values and update them
        entries.forEach(([key, incrementValue]) => {
          const getRequest = store.get(key);

          getRequest.onsuccess = () => {
            const existingRecord = getRequest.result as CounterRecord | undefined;
            /* istanbul ignore next */
            const existingValue = existingRecord ? existingRecord.value : 0;
            const putRequest = store.put({ key, value: existingValue + incrementValue });

            putRequest.onerror = (event) => {
              this.logger.debug('DiagnosticsStorage: Failed to update counter', key, event);
            };
          };

          getRequest.onerror = (event) => {
            this.logger.debug('DiagnosticsStorage: Failed to read existing counter', key, event);
          };
        });
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to increment counters', error);
    }
  }

  async setHistogramStats(histogramStats: Record<string, HistogramStats>): Promise<void> {
    try {
      if (Object.entries(histogramStats).length === 0) {
        return;
      }

      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.HISTOGRAMS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.HISTOGRAMS);

      return new Promise((resolve) => {
        const entries = Object.entries(histogramStats);

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onabort = (event) => {
          this.logger.debug('DiagnosticsStorage: Failed to set histogram stats', event);
          resolve();
        };

        // Read existing values and update them
        entries.forEach(([key, newStats]) => {
          const getRequest = store.get(key);

          getRequest.onsuccess = () => {
            const existingRecord = getRequest.result as HistogramRecord | undefined;
            let updatedStats: HistogramRecord;

            /* istanbul ignore next */
            if (existingRecord) {
              // Accumulate with existing stats
              updatedStats = {
                key,
                count: existingRecord.count + newStats.count,
                min: Math.min(existingRecord.min, newStats.min),
                max: Math.max(existingRecord.max, newStats.max),
                sum: existingRecord.sum + newStats.sum,
              };
            } else {
              // Create new stats
              updatedStats = {
                key,
                count: newStats.count,
                min: newStats.min,
                max: newStats.max,
                sum: newStats.sum,
              };
            }

            const putRequest = store.put(updatedStats);

            putRequest.onerror = (event) => {
              this.logger.debug('DiagnosticsStorage: Failed to set histogram stats', key, event);
            };
          };

          getRequest.onerror = (event) => {
            this.logger.debug('DiagnosticsStorage: Failed to read existing histogram stats', key, event);
          };
        });
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to set histogram stats', error);
    }
  }

  async addEventRecords(
    events: Array<{ event_name: string; time: number; event_properties: Record<string, any> }>,
  ): Promise<void> {
    try {
      if (events.length === 0) {
        return;
      }

      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.EVENTS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.EVENTS);

      return new Promise((resolve) => {
        transaction.oncomplete = () => {
          resolve();
        };

        /* istanbul ignore next */
        transaction.onabort = (event) => {
          this.logger.debug('DiagnosticsStorage: Failed to add event records', event);
          resolve();
        };

        // First, check how many events are currently stored
        const countRequest = store.count();

        countRequest.onsuccess = () => {
          const currentCount = countRequest.result;

          // Calculate how many events we can add
          const availableSlots = Math.max(0, MAX_PERSISTENT_STORAGE_EVENTS_COUNT - currentCount);

          if (availableSlots < events.length) {
            this.logger.debug(
              `DiagnosticsStorage: Only added ${availableSlots} of ${events.length} events due to storage limit`,
            );
          }

          // Only add events up to the available slots (take the least recent ones)
          events.slice(0, availableSlots).forEach((event) => {
            const request = store.add(event);

            request.onerror = (event) => {
              this.logger.debug('DiagnosticsStorage: Failed to add event record', event);
            };
          });
        };

        countRequest.onerror = (event) => {
          this.logger.debug('DiagnosticsStorage: Failed to count existing events', event);
        };
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to add event records', error);
    }
  }

  async setInternal(key: string, value: string): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.INTERNAL], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.INTERNAL);

      return new Promise((resolve, reject) => {
        /* istanbul ignore next */
        transaction.onabort = () => reject(new Error('Failed to set internal value'));

        const request = store.put({ key, value });

        request.onsuccess = () => resolve();

        /* istanbul ignore next */
        request.onerror = () => reject(new Error('Failed to set internal value'));
      });
    } catch (error) {
      /* istanbul ignore next */
      this.logger.debug('DiagnosticsStorage: Failed to set internal value', error);
    }
  }

  async getInternal(key: string): Promise<InternalRecord | undefined> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.INTERNAL], 'readonly');
      const store = transaction.objectStore(TABLE_NAMES.INTERNAL);

      return new Promise((resolve, reject) => {
        /* istanbul ignore next */
        transaction.onabort = () => reject(new Error('Failed to get internal value'));

        const request = store.get(key);

        request.onsuccess = () => resolve(request.result as InternalRecord | undefined);

        /* istanbul ignore next */
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
      /* istanbul ignore next */
      this.logger.debug('DiagnosticsStorage: Failed to get last flush timestamp', error);
      /* istanbul ignore next */
      return undefined;
    }
  }

  async setLastFlushTimestamp(timestamp: number): Promise<void> {
    try {
      await this.setInternal(INTERNAL_KEYS.LAST_FLUSH_TIMESTAMP, timestamp.toString());
    } catch (error) {
      /* istanbul ignore next */
      this.logger.debug('DiagnosticsStorage: Failed to set last flush timestamp', error);
    }
  }

  /* istanbul ignore next */
  clearTable(transaction: IDBTransaction, tableName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = transaction.objectStore(tableName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to clear table ${tableName}`));
    });
  }

  /* istanbul ignore next */
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
  /* istanbul ignore next */
  private getAllFromStore<T>(transaction: IDBTransaction, tableName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      const store = transaction.objectStore(tableName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as T[]);
      request.onerror = () => reject(new Error(`Failed to get all from ${tableName}`));
    });
  }
}
