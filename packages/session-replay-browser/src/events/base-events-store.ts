import { ILogger } from '@amplitude/analytics-core';
import { DEFAULT_MAX_PERSISTED_EVENTS_SIZE_BYTES, MAX_INTERVAL, MIN_INTERVAL } from '../constants';
import { Events, EventsStore, SendingSequencesReturn } from '../typings/session-replay';
import { utf8ByteLength } from '../utils/utf8-byte-length';

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
  // Running UTF-8 sizes so shouldSplitEventsList only measures newly appended events.
  // The IDB store loads a fresh array on every add, so it also keeps a per-session entry.
  private readonly eventsContentBytes = new WeakMap<Events, ContentByteCacheEntry>();
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

  // `prev` is only reused when `events` still starts with the list it measured; the tail
  // check catches a same-length rewrite of the last element.
  private isPrefixOf(prev: ContentByteCacheEntry, events: Events): boolean {
    if (events.length < prev.length) return false;
    return prev.length === 0 || events[prev.length - 1] === prev.tail;
  }

  private measureContentBytes(prev: ContentByteCacheEntry | undefined, events: Events): ContentByteCacheEntry {
    if (prev && prev.length === events.length && this.isPrefixOf(prev, events)) return prev;
    let contentBytes = 0;
    let start = 0;
    if (prev && this.isPrefixOf(prev, events)) {
      contentBytes = prev.contentBytes;
      start = prev.length;
    }
    for (let i = start; i < events.length; i++) {
      contentBytes += utf8ByteLength(events[i]);
    }
    return { length: events.length, contentBytes, tail: events.length > 0 ? events[events.length - 1] : undefined };
  }

  private getEventsContentBytes(events: Events): number {
    const entry = this.measureContentBytes(this.eventsContentBytes.get(events), events);
    this.eventsContentBytes.set(events, entry);
    return entry.contentBytes;
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

  protected recallSequenceContentBytes(sessionId: string | number, events: Events): void {
    const cached = this.sequenceContentBytes.get(sessionId);
    if (!cached || cached.length !== events.length || !this.isPrefixOf(cached, events)) return;
    this.eventsContentBytes.set(events, cached);
  }

  protected rememberSequenceContentBytes(sessionId: string | number, events: Events): void {
    const entry = this.measureContentBytes(this.sequenceContentBytes.get(sessionId), events);
    this.sequenceContentBytes.set(sessionId, entry);
    this.eventsContentBytes.set(events, entry);
  }

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
    // 1–3 UTF-8 bytes per code unit: only scan the event when `length` alone cannot decide.
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
