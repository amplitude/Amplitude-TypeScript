/// <reference lib="dom" />
/**
 * Purpose-specific IndexedDB storage for Amplitude Diagnostics
 *
 * This storage is optimized for diagnostics data with separate tables for each type:
 * - Tags: Key-value pairs for environment/context information
 * - Counters: Numeric counters that can be incremented
 * - Histograms: Individual measurements with efficient sorting via compound index
 * - Events: Diagnostic events with timestamps and properties
 */

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
  id?: number; // Auto-increment primary key
  key: string;
  value: number;
  timestamp: number;
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

/**
 * Purpose-specific IndexedDB storage for diagnostics data
 * Provides optimized methods for each type of diagnostics data
 */
export class DiagnosticsStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private dbName: string;

  constructor(apiKey: string) {
    this.dbName = `AMP_diagnostics_${apiKey.substring(0, 10)}`;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = this.openDB();
    }
    return this.dbPromise;
  }

  private openDB(): Promise<IDBDatabase> {
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

  private createTables(db: IDBDatabase): void {
    // Create tags table
    if (!db.objectStoreNames.contains(TABLE_NAMES.TAGS)) {
      db.createObjectStore(TABLE_NAMES.TAGS, { keyPath: 'key' });
    }

    // Create counters table
    if (!db.objectStoreNames.contains(TABLE_NAMES.COUNTERS)) {
      db.createObjectStore(TABLE_NAMES.COUNTERS, { keyPath: 'key' });
    }

    // Create histograms table with auto-increment primary key and compound index
    if (!db.objectStoreNames.contains(TABLE_NAMES.HISTOGRAMS)) {
      const histogramsStore = db.createObjectStore(TABLE_NAMES.HISTOGRAMS, {
        keyPath: 'id',
        autoIncrement: true,
      });

      // Create compound index on [key, value] for efficient sorting
      histogramsStore.createIndex('key_value_idx', ['key', 'value'], { unique: false });

      // Create index on key for efficient key-based queries
      histogramsStore.createIndex('key_idx', 'key', { unique: false });
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

  /**
   * Check if IndexedDB is available and working
   */
  async isEnabled(): Promise<boolean> {
    try {
      if (typeof indexedDB === 'undefined') {
        return false;
      }

      // Test if we can open the database
      const db = await this.getDB();
      return db !== null;
    } catch {
      return false;
    }
  }

  // === TAG OPERATIONS ===

  /**
   * Set a diagnostic tag
   */
  async setTag(key: string, value: string): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.TAGS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.TAGS);

      return new Promise((resolve, reject) => {
        const request = store.put({ key, value });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to set tag'));
      });
    } catch (error) {
      console.error(`[Amplitude] DiagnosticsStorage: Failed to set tag`, error);
      throw error;
    }
  }

  /**
   * Get a diagnostic tag
   */
  async getTag(key: string): Promise<TagRecord | undefined> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.TAGS], 'readonly');
      const store = transaction.objectStore(TABLE_NAMES.TAGS);

      return new Promise((resolve, reject) => {
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result as TagRecord | undefined);
        request.onerror = () => reject(new Error('Failed to get tag'));
      });
    } catch (error) {
      console.error(`[Amplitude] DiagnosticsStorage: Failed to get tag`, error);
      return undefined;
    }
  }

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
      console.error(`[Amplitude] DiagnosticsStorage: Failed to get all tags`, error);
      return [];
    }
  }

  // === COUNTER OPERATIONS ===

  /**
   * Set a counter value
   */
  async setCounter(key: string, value: number): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.COUNTERS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.COUNTERS);

      return new Promise((resolve, reject) => {
        const request = store.put({ key, value });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to set counter'));
      });
    } catch (error) {
      console.error(`[Amplitude] DiagnosticsStorage: Failed to set counter`, error);
      throw error;
    }
  }

  /**
   * Get a counter value
   */
  async getCounter(key: string): Promise<CounterRecord | undefined> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.COUNTERS], 'readonly');
      const store = transaction.objectStore(TABLE_NAMES.COUNTERS);

      return new Promise((resolve, reject) => {
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result as CounterRecord | undefined);
        request.onerror = () => reject(new Error('Failed to get counter'));
      });
    } catch (error) {
      console.error(`[Amplitude] DiagnosticsStorage: Failed to get counter`, error);
      return undefined;
    }
  }

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
      console.error(`[Amplitude] DiagnosticsStorage: Failed to get all counters`, error);
      return [];
    }
  }

  // === HISTOGRAM OPERATIONS ===

  /**
   * Add a histogram measurement
   */
  async addHistogramRecord(key: string, value: number, timestamp: number = Date.now()): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.HISTOGRAMS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.HISTOGRAMS);

      return new Promise((resolve, reject) => {
        const request = store.add({ key, value, timestamp });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to add histogram record'));
      });
    } catch (error) {
      console.error(`[Amplitude] DiagnosticsStorage: Failed to add histogram record`, error);
      throw error;
    }
  }

  /**
   * Get histogram records for a specific key, sorted by value (uses compound index)
   */
  async getHistogramRecordsSortedByValue(key: string): Promise<HistogramRecord[]> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.HISTOGRAMS], 'readonly');
      const store = transaction.objectStore(TABLE_NAMES.HISTOGRAMS);
      const index = store.index('key_value_idx');

      return new Promise((resolve, reject) => {
        const range = IDBKeyRange.bound([key, -Infinity], [key, Infinity]);
        const request = index.getAll(range);

        request.onsuccess = () => {
          // Records are already sorted by value due to the compound index
          resolve(request.result as HistogramRecord[]);
        };
        request.onerror = () => reject(new Error('Failed to get histogram records'));
      });
    } catch (error) {
      console.error(`[Amplitude] DiagnosticsStorage: Failed to get histogram records`, error);
      return [];
    }
  }

  /**
   * Get all histogram records
   */
  async getAllHistogramRecords(): Promise<HistogramRecord[]> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.HISTOGRAMS], 'readonly');
      const store = transaction.objectStore(TABLE_NAMES.HISTOGRAMS);

      return new Promise((resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result as HistogramRecord[]);
        request.onerror = () => reject(new Error('Failed to get all histogram records'));
      });
    } catch (error) {
      console.error(`[Amplitude] DiagnosticsStorage: Failed to get all histogram records`, error);
      return [];
    }
  }

  /**
   * Get total count of histogram records
   */
  async getHistogramRecordCount(): Promise<number> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.HISTOGRAMS], 'readonly');
      const store = transaction.objectStore(TABLE_NAMES.HISTOGRAMS);

      return new Promise((resolve, reject) => {
        const request = store.count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to count histogram records'));
      });
    } catch (error) {
      console.error(`[Amplitude] DiagnosticsStorage: Failed to count histogram records`, error);
      return 0;
    }
  }

  // === EVENT OPERATIONS ===

  /**
   * Add a diagnostic event
   */
  async addEventRecord(
    event_name: string,
    event_properties: Record<string, any>,
    time: number = Date.now(),
  ): Promise<void> {
    try {
      const db = await this.getDB();
      const transaction = db.transaction([TABLE_NAMES.EVENTS], 'readwrite');
      const store = transaction.objectStore(TABLE_NAMES.EVENTS);

      return new Promise((resolve, reject) => {
        const request = store.add({ event_name, event_properties, time });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to add event record'));
      });
    } catch (error) {
      console.error(`[Amplitude] DiagnosticsStorage: Failed to add event record`, error);
      throw error;
    }
  }

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
      console.error(`[Amplitude] DiagnosticsStorage: Failed to get all event records`, error);
      return [];
    }
  }

  // === INTERNAL STORAGE OPERATIONS ===

  /**
   * Set an internal value
   */
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
      console.error(`[Amplitude] DiagnosticsStorage: Failed to set internal value`, error);
      throw error;
    }
  }

  /**
   * Get an internal value
   */
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
      console.error(`[Amplitude] DiagnosticsStorage: Failed to get internal value`, error);
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
      console.error(`[Amplitude] DiagnosticsStorage: Failed to get last flush timestamp`, error);
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
      console.error(`[Amplitude] DiagnosticsStorage: Failed to set last flush timestamp`, error);
      throw error;
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
      console.error(`[Amplitude] DiagnosticsStorage: Failed to clear all data`, error);
      throw error;
    }
  }

  /**
   * Clear a specific table
   */
  private clearTable(transaction: IDBTransaction, tableName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const store = transaction.objectStore(tableName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error(`Failed to clear table ${tableName}`));
    });
  }
}
