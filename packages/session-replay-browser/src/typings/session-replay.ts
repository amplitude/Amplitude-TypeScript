import { AmplitudeReturn, ServerZone } from '@amplitude/analytics-types';
import { SessionReplayLocalConfig } from '../config/types';

export type Events = string[];

export type EventType = 'replay' | 'interaction';
export interface SessionReplayDestination {
  events: Events;
  sequenceId: number;
  type: EventType;
  sessionId: number;
  flushMaxRetries?: number;
  apiKey?: string;
  deviceId?: string;
  sampleRate: number;
  serverZone?: keyof typeof ServerZone;
  onComplete: (sequenceId: number) => Promise<void>;
}

export interface SessionReplayDestinationContext extends SessionReplayDestination {
  attempts: number;
  timeout: number;
}

export interface SendingSequencesIDBInput {
  sequenceId?: number;
  sessionId: number;
  events: Events;
}

export type SendingSequencesIDBReturn = Required<SendingSequencesIDBInput>;

export interface SessionReplayEventsIDBStore {
  initialize(type: EventType): Promise<void>;
  getSequencesToSend(): Promise<SendingSequencesIDBReturn[] | undefined>;
  /**
   * Moves current sequence of events to long term storage and resets short term storage.
   */
  storeCurrentSequence(sessionId: number): Promise<SendingSequencesIDBInput | undefined>;
  /**
   * Adds events to the current IDB sequence. Returns events that should be
   * sent to the track destination right away if should split events is true.
   */
  addEventToCurrentSequence(sessionId: number, event: string): Promise<SendingSequencesIDBReturn | undefined>;
  storeSendingEvents(sessionId: number, events: Events): Promise<number | undefined>;
  cleanUpSessionEventsStore(sessionId: number, sequenceId: number): Promise<void>;
}
export interface SessionIdentifiers {
  deviceId?: string;
  sessionId?: number;
  sessionReplayId?: string;
}

export type SessionReplayOptions = Omit<Partial<SessionReplayLocalConfig & SessionIdentifiers>, 'apiKey'>;

export interface AmplitudeSessionReplay {
  init: (apiKey: string, options: SessionReplayOptions) => AmplitudeReturn<void>;
  setSessionId: (sessionId: number, deviceId?: string) => AmplitudeReturn<void>;
  getSessionId: () => number | undefined;
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
    sessionId: number;
    event: { type: Type; data: Event };
    deviceId: string;
  }): void;
  /**
   * Move events in short term storage to long term storage and send immediately to the track destination.
   */
  sendCurrentSequenceEvents({ sessionId, deviceId }: { sessionId: number; deviceId: string }): void;
  /**
   * Flush the track destination queue immediately. This should invoke sends for all the events in the queue.
   */
  flush(useRetry?: boolean): Promise<void>;
}
