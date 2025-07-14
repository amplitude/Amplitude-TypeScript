import { MAX_EVENT_LIST_SIZE, MAX_INTERVAL, MIN_INTERVAL } from '../constants';
import { Events, EventsStore, SendingSequencesReturn } from '../typings/session-replay';
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
    event: string,
  ): Promise<SendingSequencesReturn<KeyType> | undefined>;
  abstract getSequencesToSend(): Promise<SendingSequencesReturn<KeyType>[] | undefined>;
  abstract storeCurrentSequence(sessionId: number): Promise<SendingSequencesReturn<KeyType> | undefined>;
  abstract storeSendingEvents(sessionId: string | number, events: Events): Promise<KeyType | undefined>;
  abstract cleanUpSessionEventsStore(sessionId: number, sequenceId: KeyType): Promise<void>;

  /**
   * Calculates the character length of a string as size approximation
   * Note: String length closely approximates byte size for most content
   */
  private getStringSize(str: string): number {
    return str.length;
  }

  /**
   * Calculates the total character length of events array
   * Accounts for JSON serialization overhead when sent to backend
   */
  private getEventsArraySize(events: Events): number {
    let totalSize = 0;
    for (const event of events) {
      totalSize += this.getStringSize(event);
    }

    // Additional overhead from using length instead of byte size
    // - Array brackets: [] = 2 characters
    // - Commas between events: events.length - 1
    // - Double quotes around each event: events.length * 2
    const overhead = 2 + Math.max(0, events.length - 1) + events.length * 2;

    return totalSize + overhead;
  }

  /**
   * Determines whether to send the events list to the backend and start a new
   * empty events list, based on the size of the list as well as the last time sent
   * @param nextEventString
   * @returns boolean
   */
  shouldSplitEventsList = (events: Events, nextEventString: string): boolean => {
    const sizeOfNextEvent = this.getStringSize(nextEventString);
    const sizeOfEventsList = this.getEventsArraySize(events);

    // Check size constraint first (most likely to trigger)
    if (sizeOfEventsList + sizeOfNextEvent >= this.maxPersistedEventsSize) {
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
