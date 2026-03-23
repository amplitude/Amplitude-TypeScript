import { MAX_EVENT_LIST_SIZE, MAX_INTERVAL, MIN_INTERVAL } from '../constants';
import { EventData, Events, EventsStore, SendingSequencesReturn } from '../typings/session-replay';
import { ILogger } from '@amplitude/analytics-core';

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
  private maxPersistedEventsSize = MAX_EVENT_LIST_SIZE;
  private interval = this.minInterval;
  private _timeAtLastSplit = Date.now(); // Initialize this so we have a point of comparison when events are recorded

  public get timeAtLastSplit() {
    return this._timeAtLastSplit;
  }

  constructor(args: InstanceArgs) {
    this.loggerProvider = args.loggerProvider;
    this.minInterval = args.minInterval ?? this.minInterval;
    this.maxInterval = args.maxInterval ?? this.maxInterval;
    this.maxPersistedEventsSize = args.maxPersistedEventsSize ?? this.maxPersistedEventsSize;
  }

  abstract addEventToCurrentSequence(
    sessionId: string | number,
    event: EventData,
  ): Promise<SendingSequencesReturn<KeyType> | undefined>;
  abstract getSequencesToSend(): Promise<SendingSequencesReturn<KeyType>[] | undefined>;
  abstract storeCurrentSequence(sessionId: number): Promise<SendingSequencesReturn<KeyType> | undefined>;
  abstract storeSendingEvents(sessionId: string | number, events: Events): Promise<KeyType | undefined>;
  abstract cleanUpSessionEventsStore(sessionId: number, sequenceId: KeyType): Promise<void>;

  /**
   * Estimates the byte size of a single event without serialization.
   * For string events (JSON path) uses the string length directly.
   * For object events (msgpack path) uses a recursive string-length walk —
   * sums string key/value lengths plus small constants for structural overhead.
   * This underestimates the true size but avoids JSON.stringify overhead; flushing
   * slightly more often is the acceptable tradeoff.
   */
  protected getEventSize(event: EventData): number {
    if (typeof event === 'string') {
      return event.length;
    }
    return BaseEventsStore.roughObjectSize(event);
  }

  private static roughObjectSize(val: unknown, depth = 0): number {
    if (depth > 10) return 0;
    if (typeof val === 'string') return val.length;
    if (typeof val === 'number' || typeof val === 'boolean') return 8;
    if (val === null || val === undefined) return 4;
    if (Array.isArray(val)) {
      return val.reduce((sum: number, v) => sum + BaseEventsStore.roughObjectSize(v, depth + 1), 2);
    }
    if (typeof val === 'object') {
      return Object.entries(val as Record<string, unknown>).reduce(
        (sum, [k, v]) => sum + k.length + BaseEventsStore.roughObjectSize(v, depth + 1) + 3,
        2,
      );
    }
    return 0;
  }

  /**
   * Determines whether to send the events list to the backend and start a new
   * empty events list, based on the accumulated size of the current batch and
   * the time since the last split.
   *
   * @param currentBatchSize - pre-computed running total of the current batch (characters)
   * @param nextEvent - the event about to be appended
   * @param hasEvents - whether the current batch is non-empty (for time-based split guard)
   */
  shouldSplitEventsList = (currentBatchSize: number, nextEvent: EventData, hasEvents: boolean): boolean => {
    const sizeOfNextEvent = this.getEventSize(nextEvent);

    // Check size constraint first (most likely to trigger)
    if (currentBatchSize + sizeOfNextEvent >= this.maxPersistedEventsSize) {
      return true;
    }
    if (Date.now() - this.timeAtLastSplit > this.interval && hasEvents) {
      this.interval = Math.min(this.maxInterval, this.interval + this.minInterval);
      this._timeAtLastSplit = Date.now();
      return true;
    }
    return false;
  };
}
