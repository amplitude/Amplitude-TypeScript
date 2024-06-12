import { AmplitudeReturn, ServerZone } from '@amplitude/analytics-types';
import { SessionReplayLocalConfig } from '../config/types';

export type Events = string[];

export type EventType = 'rrweb' | 'interaction';
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
  storeCurrentSequence(sessionId: number): Promise<SendingSequencesIDBInput | undefined>;
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
  sendEventsList: (destinationData: SessionReplayDestination) => void;
  flush: (useRetry: boolean) => Promise<void>;
}

export interface SessionReplayEventsManager {
  sendStoredEvents({ deviceId }: { deviceId: string }): Promise<void>;
  addEvent({ sessionId, event, deviceId }: { sessionId: number; event: string; deviceId: string }): void;
  sendCurrentSequenceEvents({ sessionId, deviceId }: { sessionId: number; deviceId: string }): void;
  flush(useRetry?: boolean): Promise<void>;
}
