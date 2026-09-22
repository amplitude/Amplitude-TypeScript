import {
  CounterRecord,
  EventRecord,
  HistogramRecord,
  HistogramStats,
  IDiagnosticsStorage,
  ILogger,
  ReactNativeStorageData,
  Storage,
  TagRecord,
} from '@amplitude/analytics-core';

const MAX_PERSISTENT_STORAGE_EVENTS_COUNT = 10;

interface DiagnosticsBlob {
  tags: Record<string, string>;
  counters: Record<string, number>;
  histograms: Record<string, HistogramStats>;
  events: EventRecord[];
  lastFlushTimestamp?: number;
}

const emptyBlob = (): DiagnosticsBlob => ({ tags: {}, counters: {}, histograms: {}, events: [] });

/**
 * Diagnostics storage for React Native, backed by the storage configured on the client.
 *
 * The blob is held in memory and persisted to a single storage key. Keeping memory as the source
 * of truth avoids read-modify-write races when the injected storage has no transactions. One key
 * also means one write per save tick instead of one per data type.
 *
 * When no storage is configured this degrades to memory-only — diagnostics still accumulate and
 * flush for the life of the app, and are lost on app kill. Nothing here throws on that path.
 */
export class ReactNativeDiagnosticsStorage implements IDiagnosticsStorage {
  readonly storageKey: string;
  private readonly logger: ILogger;
  private blob: DiagnosticsBlob = emptyBlob();
  private readonly ready: Promise<void>;
  /** Serializes writes so concurrent callers can't clobber each other's snapshot of the blob. */
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(apiKey: string, logger: ILogger, private readonly storage?: Storage<ReactNativeStorageData>) {
    this.logger = logger;
    this.storageKey = `AMP_diagnostics_${apiKey.substring(0, 10)}`;
    this.ready = this.hydrate();
  }

  private async hydrate(): Promise<void> {
    if (!this.storage) {
      return;
    }
    try {
      const persisted = await this.storage.get(this.storageKey);
      if (persisted && !Array.isArray(persisted)) {
        this.blob = persisted as DiagnosticsBlob;
      }
    } catch (error) {
      this.logger.debug('ReactNativeDiagnosticsStorage: Failed to read persisted diagnostics', error);
    }
  }

  private persist(): Promise<void> {
    if (!this.storage) {
      return Promise.resolve();
    }
    this.writeQueue = this.writeQueue.then(async () => {
      try {
        await this.storage?.set(this.storageKey, this.blob);
      } catch (error) {
        // The backing store may be unavailable or the entry may exceed its platform size limit.
        // Memory stays authoritative and the next save tick rewrites.
        this.logger.debug('ReactNativeDiagnosticsStorage: Failed to persist diagnostics', error);
      }
    });
    return this.writeQueue;
  }

  async setTags(tags: Record<string, string>): Promise<void> {
    if (Object.keys(tags).length === 0) {
      return;
    }
    await this.ready;
    for (const [key, value] of Object.entries(tags)) {
      this.blob.tags[key] = value;
    }
    await this.persist();
  }

  async incrementCounters(counters: Record<string, number>): Promise<void> {
    if (Object.keys(counters).length === 0) {
      return;
    }
    await this.ready;
    for (const [key, increment] of Object.entries(counters)) {
      this.blob.counters[key] = (this.blob.counters[key] ?? 0) + increment;
    }
    await this.persist();
  }

  async setHistogramStats(histogramStats: Record<string, HistogramStats>): Promise<void> {
    if (Object.keys(histogramStats).length === 0) {
      return;
    }
    await this.ready;
    for (const [key, stats] of Object.entries(histogramStats)) {
      const existing = this.blob.histograms[key];
      this.blob.histograms[key] = existing
        ? {
            count: existing.count + stats.count,
            min: Math.min(existing.min, stats.min),
            max: Math.max(existing.max, stats.max),
            sum: existing.sum + stats.sum,
          }
        : { ...stats };
    }
    await this.persist();
  }

  async addEventRecords(
    events: Array<{ event_name: string; time: number; event_properties: Record<string, any> }>,
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await this.ready;
    const availableSlots = Math.max(0, MAX_PERSISTENT_STORAGE_EVENTS_COUNT - this.blob.events.length);
    if (availableSlots < events.length) {
      this.logger.debug(
        `ReactNativeDiagnosticsStorage: Only added ${availableSlots} of ${events.length} events due to storage limit`,
      );
    }
    if (availableSlots === 0) {
      return;
    }
    // Keep the least recent, matching the browser's persistent storage.
    this.blob.events.push(...events.slice(0, availableSlots));
    await this.persist();
  }

  async setLastFlushTimestamp(timestamp: number): Promise<void> {
    await this.ready;
    this.blob.lastFlushTimestamp = timestamp;
    await this.persist();
  }

  async getLastFlushTimestamp(): Promise<number | undefined> {
    await this.ready;
    return this.blob.lastFlushTimestamp;
  }

  async getAllAndClear(): Promise<{
    tags: TagRecord[];
    counters: CounterRecord[];
    histogramStats: HistogramRecord[];
    events: EventRecord[];
  }> {
    await this.ready;

    const tags: TagRecord[] = Object.entries(this.blob.tags).map(([key, value]) => ({ key, value }));
    const counters: CounterRecord[] = Object.entries(this.blob.counters).map(([key, value]) => ({ key, value }));
    const histogramStats: HistogramRecord[] = Object.entries(this.blob.histograms).map(([key, stats]) => ({
      key,
      ...stats,
    }));
    const events = this.blob.events;

    // Tags survive: they describe the environment, not one reporting window. Matches
    // DiagnosticsStorage.getAllAndClear in analytics-core.
    this.blob.counters = {};
    this.blob.histograms = {};
    this.blob.events = [];
    await this.persist();

    return { tags, counters, histogramStats, events };
  }
}
