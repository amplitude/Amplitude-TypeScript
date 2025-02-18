import { AmplitudeReturn, ServerZone } from '@amplitude/analytics-types';
import { SessionReplayJoinedConfig, SessionReplayLocalConfig, SessionReplayVersion } from '../config/types';

export type StorageData = {
  totalStorageSize: number;
  percentOfQuota: number;
  usageDetails: string;
};

export interface DebugInfo extends Partial<StorageData> {
  config: SessionReplayJoinedConfig;
  version: string;
}

export type Events = string[];

export type StoreType = 'memory' | 'idb';

export type EventType = 'replay' | 'interaction';

export type ConsoleLogLevel = 'info' | 'log' | 'warn' | 'error';

export interface SessionReplayDestinationSessionMetadata {
  type: EventType;
  sessionId: string | number;
  deviceId: string | undefined;
  version?: SessionReplayVersion;
}

export type SessionReplayDestination = {
  events: Events;
  flushMaxRetries?: number;
  apiKey?: string;
  sampleRate: number;
  serverZone?: keyof typeof ServerZone;
  onComplete: () => Promise<void>;
} & SessionReplayDestinationSessionMetadata;

export interface SessionReplayDestinationContext extends SessionReplayDestination {
  attempts: number;
  timeout: number;
}

export interface SendingSequencesReturn<KeyType> {
  sequenceId: KeyType;
  sessionId: string | number;
  events: Events;
}

/**
 * This interface is not guaranteed to be stable, yet.
 */
export interface EventsStore<KeyType> {
  getSequencesToSend(): Promise<SendingSequencesReturn<KeyType>[] | undefined>;
  /**
   * Moves current sequence of events to long term storage and resets short term storage.
   */
  storeCurrentSequence(sessionId: string | number): Promise<SendingSequencesReturn<KeyType> | undefined>;
  /**
   * Adds events to the current IDB sequence. Returns events that should be
   * sent to the track destination right away if should split events is true.
   */
  addEventToCurrentSequence(
    sessionId: string | number,
    event: string,
  ): Promise<SendingSequencesReturn<KeyType> | undefined>;
  /**
   * Returns the sequence id associated with the events batch.
   * @returns the new sequence id or undefined if it cannot be determined or on any error.
   */
  storeSendingEvents(sessionId: string | number, events: Events): Promise<KeyType | undefined>;
  /**
   * Permanently removes the events batch for the session/sequence pair.
   */
  cleanUpSessionEventsStore(sessionId: string | number, sequenceId?: KeyType): Promise<void>;
}
export interface SessionIdentifiers {
  deviceId?: string;
  sessionId?: string | number;
  sessionReplayId?: string;
}

export type SessionReplayOptions = Omit<Partial<SessionReplayLocalConfig & SessionIdentifiers>, 'apiKey'>;

export interface AmplitudeSessionReplay {
  init: (apiKey: string, options: SessionReplayOptions) => AmplitudeReturn<void>;
  setSessionId: (sessionId: string | number, deviceId?: string) => AmplitudeReturn<void>;
  getSessionId: () => string | number | undefined;
  getSessionReplayProperties: () => { [key: string]: boolean | string | null };
  flush: (useRetry: boolean) => Promise<void>;
  shutdown: () => void;
}

export interface SessionReplayTrackDestination {
  /**
   * Enqueues events to be sent.
   */
  sendEventsList: (destinationData: SessionReplayDestination) => void;
  /**
   * Immediately sends queued events.
   */
  flush: (useRetry: boolean) => Promise<void>;
}

export type EventsManagerWithType<EventType, EventDataType> = {
  name: EventType;
  manager: SessionReplayEventsManager<EventType, EventDataType>;
};

export interface SessionReplayEventsManager<Type, Event> {
  /**
   * For each sequence stored in the long term indexed DB send immediately to the track destination.
   */
  sendStoredEvents({ deviceId }: { deviceId: string }): Promise<void>;
  /**
   * Adds an event to the short term storage. If should split based on size or last sent, then send immediately.
   */
  addEvent({
    sessionId,
    event,
    deviceId,
  }: {
    sessionId: string | number;
    event: { type: Type; data: Event };
    deviceId: string;
  }): void;
  /**
   * Move events in short term storage to long term storage and send immediately to the track destination.
   */
  sendCurrentSequenceEvents({ sessionId, deviceId }: { sessionId: string | number; deviceId: string }): void;
  /**
   * Flush the track destination queue immediately. This should invoke sends for all the events in the queue.
   */
  flush(useRetry?: boolean): Promise<void>;
}
