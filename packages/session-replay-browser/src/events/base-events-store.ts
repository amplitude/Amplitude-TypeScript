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
   * Returns the size of a single event for batch-splitting decisions.
   * For string events (JSON path) uses string length directly.
   * For object events (msgpack path) returns 0 — the events are not serialized
   * until the batch is sent, so size-based splitting is not meaningful here.
   * Time-based splitting handles flushing on the msgpack path instead.
   */
  protected getEventSize(event: EventData): number {
    if (typeof event === 'string') {
      return event.length;
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
