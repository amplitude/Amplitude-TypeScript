import { ILogger } from '@amplitude/analytics-core';
import { DEFAULT_MAX_PERSISTED_EVENTS_SIZE_BYTES, MAX_INTERVAL, MIN_INTERVAL } from '../constants';
import { Events, EventsStore, SendingSequencesReturn } from '../typings/session-replay';
import { utf8ByteLength } from '../utils/utf8-byte-length';

/**
 * Running UTF-8 content size of an events list.
 * `tail` is the last string when `length > 0`, so a same-length rewrite of that
 * element (or an append whose prefix no longer matches) misses the cache and
 * is measured again. Earlier elements are assumed append-only: the stores
 * either push or replace the whole list.
 */
type ContentByteCacheEntry = {
  length: number;
  contentBytes: number;
  tail?: string;
};

export type InstanceArgs = {
  loggerProvider: ILogger;
  minInterval?: number;
  maxInterval?: number;
  maxPersistedEventsSize?: number;
};

export abstract class BaseEventsStore<KeyType> implements EventsStore<KeyType> {
  protected readonly loggerProvider: ILogger;
  private minInterval = MIN_INTERVAL;
  private maxInterval = MAX_INTERVAL;
  private maxPersistedEventsSize = DEFAULT_MAX_PERSISTED_EVENTS_SIZE_BYTES;
  // Assigned in the constructor after `minInterval` is overridden by `args`. Class-field
  // initializers run before the constructor body, so initializing here would freeze
  // `interval` at the class-field default (500ms) — defeating any caller-supplied minInterval
  // for the very first split.
  private interval!: number;
  private _timeAtLastSplit = Date.now(); // Initialize this so we have a point of comparison when events are recorded
  // Keyed by the events array object. The in-memory store reuses one array and
  // appends, so each shouldSplitEventsList call measures only the new tail
  // instead of re-walking the whole buffer (up to maxPersistedEventsSize, 6 MB).
  private readonly eventsContentBytes = new WeakMap<Events, ContentByteCacheEntry>();
  // IDB reloads a fresh array on every add, so array identity does not survive
  // across calls. This map keeps the same running total keyed by session.
  private readonly sequenceContentBytes = new Map<string | number, ContentByteCacheEntry>();

  public get timeAtLastSplit() {
    return this._timeAtLastSplit;
  }

  constructor(args: InstanceArgs) {
    this.loggerProvider = args.loggerProvider;
    this.minInterval = args.minInterval ?? this.minInterval;
    this.maxInterval = args.maxInterval ?? this.maxInterval;
    this.maxPersistedEventsSize = args.maxPersistedEventsSize ?? this.maxPersistedEventsSize;
    this.interval = this.minInterval;
  }

  abstract addEventToCurrentSequence(
    sessionId: string | number,
    event: string,
  ): Promise<SendingSequencesReturn<KeyType> | undefined>;
  abstract getSequencesToSend(): Promise<SendingSequencesReturn<KeyType>[] | undefined>;
  abstract storeCurrentSequence(sessionId: number): Promise<SendingSequencesReturn<KeyType> | undefined>;
  abstract storeSendingEvents(sessionId: string | number, events: Events): Promise<KeyType | undefined>;
  abstract cleanUpSessionEventsStore(sessionId: number, sequenceId: KeyType): Promise<void>;

  private cacheMatches(cached: ContentByteCacheEntry, events: Events): boolean {
    if (cached.length !== events.length) return false;
    if (cached.length === 0) return true;
    return events[cached.length - 1] === cached.tail;
  }

  /**
   * UTF-8 byte size of the event strings only (no JSON array overhead).
   * Reuses a cached total when `events` has only grown by append since the
   * last call on this same array.
   */
  private getEventsContentBytes(events: Events): number {
    const cached = this.eventsContentBytes.get(events);
    if (cached && this.cacheMatches(cached, events)) {
      return cached.contentBytes;
    }

    let contentBytes = 0;
    let start = 0;
    if (cached && events.length > cached.length && (cached.length === 0 || events[cached.length - 1] === cached.tail)) {
      contentBytes = cached.contentBytes;
      start = cached.length;
    }
    for (let i = start; i < events.length; i++) {
      contentBytes += utf8ByteLength(events[i]);
    }
    this.eventsContentBytes.set(events, {
      length: events.length,
      contentBytes,
      tail: events.length > 0 ? events[events.length - 1] : undefined,
    });
    return contentBytes;
  }

  /**
   * Calculates the total UTF-8 byte size of events array
   * Accounts for JSON serialization overhead when sent to backend
   */
  private getEventsArraySize(events: Events): number {
    const totalSize = this.getEventsContentBytes(events);

    // Approximate overhead from the array portion of the JSON payload:
    // - Array brackets: [] = 2 bytes
    // - Commas between events: events.length - 1 bytes
    // - Double quotes wrapping each event string: events.length * 2 bytes
    // Note: does not include the outer { version, events } wrapper (~22 bytes) or
    // per-event JSON-escaping of " and \ characters; the 2 MB MAX_EVENT_LIST_SIZE cap
    // stays well under the server's 10 MB decompressed split threshold even with those.
    const overhead = 2 + Math.max(0, events.length - 1) + events.length * 2;

    return totalSize + overhead;
  }

  /**
   * Copies a session's running content size onto `events` so the next
   * getEventsArraySize call on this (newly loaded) array is O(1).
   * No-op when the stored length or tail does not match — the caller then
   * pays for one full scan and rememberSequenceContentBytes replaces the entry.
   */
  protected recallSequenceContentBytes(sessionId: string | number, events: Events): void {
    const cached = this.sequenceContentBytes.get(sessionId);
    if (!cached || !this.cacheMatches(cached, events)) return;
    this.eventsContentBytes.set(events, cached);
  }

  /**
   * Records the content size of the sequence just written for `sessionId`.
   * An append of one or more events onto the previously remembered list only
   * measures the new tail.
   */
  protected rememberSequenceContentBytes(sessionId: string | number, events: Events): void {
    const prev = this.sequenceContentBytes.get(sessionId);
    let contentBytes = 0;
    let start = 0;
    // Only trust a longer list when it still ends with the previous tail, i.e. it
    // was produced by append. A shorter replacement (split, or a cleared slot)
    // falls through and is measured from scratch.
    if (prev && events.length > prev.length && (prev.length === 0 || events[prev.length - 1] === prev.tail)) {
      contentBytes = prev.contentBytes;
      start = prev.length;
    }
    for (let i = start; i < events.length; i++) {
      contentBytes += utf8ByteLength(events[i]);
    }
    const entry: ContentByteCacheEntry = {
      length: events.length,
      contentBytes,
      tail: events.length > 0 ? events[events.length - 1] : undefined,
    };
    this.sequenceContentBytes.set(sessionId, entry);
    this.eventsContentBytes.set(events, entry);
  }

  /** Drops the session size cache after a failed write so the next read recounts. */
  protected forgetSequenceContentBytes(sessionId: string | number): void {
    this.sequenceContentBytes.delete(sessionId);
  }

  /**
   * Determines whether to send the events list to the backend and start a new
   * empty events list, based on the size of the list as well as the last time sent
   * @param nextEventString
   * @returns boolean
   */
  shouldSplitEventsList = (events: Events, nextEventString: string): boolean => {
    const sizeOfEventsList = this.getEventsArraySize(events);
    // A UTF-16 code unit is between 1 and 3 UTF-8 bytes, so most events decide
    // the cap check from `length` alone. Only the band where the min and max
    // disagree needs an exact scan of the incoming string.
    const room = this.maxPersistedEventsSize - sizeOfEventsList;
    let exceedsCap = nextEventString.length >= room;
    if (!exceedsCap && nextEventString.length * 3 >= room) {
      exceedsCap = utf8ByteLength(nextEventString) >= room;
    }
    if (exceedsCap) {
      return true;
    }
    if (Date.now() - this.timeAtLastSplit > this.interval && events.length) {
      this.interval = Math.min(this.maxInterval, this.interval + this.minInterval);
      this._timeAtLastSplit = Date.now();
      return true;
    }
    return false;
  };
}
