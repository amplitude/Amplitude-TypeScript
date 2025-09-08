/// <reference lib="dom" />
import { ILogger } from 'src/logger';

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
  // Setters
  setTags(tags: Record<string, string>): Promise<void>;
  setCounters(counters: Record<string, number>): Promise<void>;
  setHistogramStats(
    histogramStats: Record<string, { count: number; min: number; max: number; sum: number }>,
  ): Promise<void>;
  addEventRecords(
    events: Array<{ event_name: string; time: number; event_properties: Record<string, any> }>,
  ): Promise<void>;
  setLastFlushTimestamp(timestamp: number): Promise<void>;

  // Getters
  getAllTags(): Promise<TagRecord[]>;
  getAllCounters(): Promise<CounterRecord[]>;
  getAllHistogramStats(): Promise<HistogramRecord[]>;
  getAllEventRecords(): Promise<EventRecord[]>;
  getLastFlushTimestamp(): Promise<number | undefined>;

  // Cleanup
  clearAllData(): Promise<void>;
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

  // === BATCH TAG OPERATIONS ===

  /**
   * Get all diagnostic tags
   */
  async getAllTags(): Promise<TagRecord[]> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.TAGS], 'readonly');
      const store = transaction.objectStore(TABLE_NAMES.TAGS);

      return new Promise((resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result as TagRecord[]);
        request.onerror = () => reject(new Error('Failed to get all tags'));
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to get all tags', error);
      return [];
    }
  }

  /**
   * Set multiple tags in a single transaction (batch operation)
   */
  async setTags(tags: Record<string, string>): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.TAGS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.TAGS);

      return new Promise((resolve, reject) => {
        let completed = 0;
        const entries = Object.entries(tags);

        if (entries.length === 0) {
          resolve();
          return;
        }

        entries.forEach(([key, value]) => {
          const request = store.put({ key, value });

          request.onsuccess = () => {
            completed++;
            if (completed === entries.length) {
              resolve();
            }
          };

          request.onerror = () => reject(new Error('Failed to set tags'));
        });
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to set tags', error);
    }
  }

  // === BATCH COUNTER OPERATIONS ===

  /**
   * Get all counters
   */
  async getAllCounters(): Promise<CounterRecord[]> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.COUNTERS], 'readonly');
      const store = transaction.objectStore(TABLE_NAMES.COUNTERS);

      return new Promise((resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result as CounterRecord[]);
        request.onerror = () => reject(new Error('Failed to get all counters'));
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to get all counters', error);
      return [];
    }
  }

  /**
   * Set multiple counters in a single transaction (batch operation)
   */
  async setCounters(counters: Record<string, number>): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.COUNTERS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.COUNTERS);

      return new Promise((resolve, reject) => {
        let completed = 0;
        const entries = Object.entries(counters);

        if (entries.length === 0) {
          resolve();
          return;
        }

        entries.forEach(([key, value]) => {
          const request = store.put({ key, value });

          request.onsuccess = () => {
            completed++;
            if (completed === entries.length) {
              resolve();
            }
          };

          request.onerror = () => reject(new Error('Failed to set counters'));
        });
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to set counters', error);
    }
  }

  // === BATCH HISTOGRAM OPERATIONS ===

  /**
   * Set multiple histogram stats in a single transaction (batch operation)
   */
  async setHistogramStats(
    histogramStats: Record<string, { count: number; min: number; max: number; sum: number }>,
  ): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.HISTOGRAMS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.HISTOGRAMS);

      return new Promise((resolve, reject) => {
        let completed = 0;
        const entries = Object.entries(histogramStats);

        if (entries.length === 0) {
          resolve();
          return;
        }

        entries.forEach(([key, stats]) => {
          const request = store.put({ key: key, count: stats.count, min: stats.min, max: stats.max, sum: stats.sum });

          request.onsuccess = () => {
            completed++;
            if (completed === entries.length) {
              resolve();
            }
          };

          request.onerror = () => reject(new Error('Failed to set histogram stats'));
        });
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to set histogram stats', error);
    }
  }

  /**
   * Get all histogram stats
   */
  async getAllHistogramStats(): Promise<HistogramRecord[]> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.HISTOGRAMS], 'readonly');
      const store = transaction.objectStore(TABLE_NAMES.HISTOGRAMS);

      return new Promise((resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result as HistogramRecord[]);
        request.onerror = () => reject(new Error('Failed to get all histogram stats'));
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to get all histogram stats', error);
      return [];
    }
  }

  // === BATCH EVENT OPERATIONS ===

  /**
   * Get all event records
   */
  async getAllEventRecords(): Promise<EventRecord[]> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.EVENTS], 'readonly');
      const store = transaction.objectStore(TABLE_NAMES.EVENTS);

      return new Promise((resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result as EventRecord[]);
        request.onerror = () => reject(new Error('Failed to get all event records'));
      });
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to get all event records', error);
      return [];
    }
  }

  /**
   * Add multiple event records in a single transaction (batch operation)
   */
  async addEventRecords(
    events: Array<{ event_name: string; time: number; event_properties: Record<string, any> }>,
  ): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.EVENTS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.EVENTS);

      return new Promise((resolve, reject) => {
        let completed = 0;

        if (events.length === 0) {
          resolve();
          return;
        }

        events.forEach((event) => {
          const request = store.add({
            event_name: event.event_name,
            event_properties: event.event_properties,
            time: event.time,
          });

          request.onsuccess = () => {
            completed++;
            if (completed === events.length) {
              resolve();
            }
          };

          request.onerror = () => reject(new Error('Failed to add event records'));
        });
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

  // === FLUSH TIMESTAMP OPERATIONS ===

  /**
   * Get the last flush timestamp
   */
  async getLastFlushTimestamp(): Promise<number | undefined> {
    try {
      const record = await this.getInternal(INTERNAL_KEYS.LAST_FLUSH_TIMESTAMP);
      return record ? parseInt(record.value, 10) : undefined;
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to get last flush timestamp', error);
      return undefined;
    }
  }

  /**
   * Set the last flush timestamp
   */
  async setLastFlushTimestamp(timestamp: number): Promise<void> {
    try {
      await this.setInternal(INTERNAL_KEYS.LAST_FLUSH_TIMESTAMP, timestamp.toString());
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to set last flush timestamp', error);
    }
  }

  // === CLEANUP OPERATIONS ===

  /**
   * Clear all data from all tables
   */
  async clearAllData(): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction(
        [TABLE_NAMES.TAGS, TABLE_NAMES.COUNTERS, TABLE_NAMES.HISTOGRAMS, TABLE_NAMES.EVENTS, TABLE_NAMES.INTERNAL],
        'readwrite',
      );

      const promises = [
        this.clearTable(transaction, TABLE_NAMES.TAGS),
        this.clearTable(transaction, TABLE_NAMES.COUNTERS),
        this.clearTable(transaction, TABLE_NAMES.HISTOGRAMS),
        this.clearTable(transaction, TABLE_NAMES.EVENTS),
        this.clearTable(transaction, TABLE_NAMES.INTERNAL),
      ];

      await Promise.all(promises);
    } catch (error) {
      this.logger.debug('DiagnosticsStorage: Failed to clear all data', error);
    }
  }

  /**
   * Clear a specific table
   */
  clearTable(transaction: IDBTransaction, tableName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = transaction.objectStore(tableName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to clear table ${tableName}`));
    });
  }
}
