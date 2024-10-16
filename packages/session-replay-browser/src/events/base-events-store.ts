import { STORAGE_FAILURE } from '../messages';
import { MAX_EVENT_LIST_SIZE_IN_BYTES, MAX_INTERVAL, MIN_INTERVAL } from '../constants';
import { Events, EventsStore, SendingSequencesReturn } from '../typings/session-replay';
import { Logger } from '@amplitude/analytics-types';

export type InstanceArgs = {
  loggerProvider: Logger;
  minInterval?: number;
  maxInterval?: number;
  maxPersistedEventsSize?: number;
};

export abstract class BaseEventsStore<KeyType, TX> implements EventsStore<KeyType> {
  protected readonly loggerProvider: Logger;
  private minInterval = MIN_INTERVAL;
  private maxInterval = MAX_INTERVAL;
  private maxPersistedEventsSize = MAX_EVENT_LIST_SIZE_IN_BYTES;
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

  abstract startTransaction(): Promise<TX>;
  abstract finishTransaction(tx: TX): Promise<void>;
  abstract resetCurrentSequence(sessionId: number, tx: TX): Promise<void>;
  abstract getCurrentSequence(sessionId: number, tx: TX): Promise<Events>;
  abstract addToCurrentSequence(sessionId: number, event: string, tx: TX): Promise<void>;
  abstract persistSequence(sessionId: number, events?: Events): Promise<SendingSequencesReturn<KeyType> | undefined>;
  abstract getPersistedSequences(limit?: number): Promise<SendingSequencesReturn<KeyType>[]>;
  abstract deleteSequence(sessionId: number, sequenceId?: KeyType): Promise<void>;

  async storeCurrentSequence(sessionId: number): Promise<SendingSequencesReturn<KeyType> | undefined> {
    return await this.persistSequence(sessionId);
  }

  async addEventToCurrentSequence(
    sessionId: number,
    event: string,
  ): Promise<SendingSequencesReturn<KeyType> | undefined> {
    try {
      const tx = await this.startTransaction();
      const sequenceEvents = await this.getCurrentSequence(sessionId, tx);
      if (!sequenceEvents) {
        await this.addToCurrentSequence(sessionId, event, tx);
        return undefined;
      }
      let eventsToSend;
      if (this.shouldSplitEventsList(sequenceEvents, event)) {
        eventsToSend = sequenceEvents;
        await this.resetCurrentSequence(sessionId, tx);
      }
      await this.addToCurrentSequence(sessionId, event, tx);

      await this.finishTransaction(tx);
      if (!eventsToSend) {
        return undefined;
      }

      const sequence = await this.persistSequence(sessionId, eventsToSend);

      if (!sequence) {
        return undefined;
      }

      return {
        events: eventsToSend,
        sessionId,
        sequenceId: sequence.sequenceId,
      };
    } catch (e) {
      this.loggerProvider.warn(`${STORAGE_FAILURE}: ${e as string}`);
    }
    return undefined;
  }

  /**
   * Determines whether to send the events list to the backend and start a new
   * empty events list, based on the size of the list as well as the last time sent
   * @param nextEventString
   * @returns boolean
   */
  private shouldSplitEventsList = (events: Events, nextEventString: string): boolean => {
    const sizeOfNextEvent = new Blob([nextEventString]).size;
    const sizeOfEventsList = new Blob(events).size;
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
