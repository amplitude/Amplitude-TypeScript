import { AmplitudeReturn, ServerZone } from '@amplitude/analytics-types';
import { SessionReplayLocalConfig, SessionReplayRemoteConfig } from '../config/types';

export type Events = string[];

export interface SessionReplayDestination {
  events: Events;
  sequenceId: number;
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

export enum SendingStatus {
  SENDING = 'sending',
  SENT = 'sent',
}

export interface IDBStoreSequence {
  events: Events;
  status: SendingStatus;
}

export interface SendingSequencesIDBInput {
  sequenceId?: number;
  sessionId: number;
  events: Events;
}

export type SendingSequencesIDBReturn = Required<SendingSequencesIDBInput>;

export interface IDBStoreSession {
  currentSequenceId: number;
  sessionSequences: {
    [sequenceId: number]: IDBStoreSequence;
  };
}

export interface IDBRemoteConfig {
  config: SessionReplayRemoteConfig;
  lastFetchedSessionId: number | undefined;
}

export interface IDBStore {
  remoteConfig?: IDBRemoteConfig;
  [sessionId: number]: IDBStoreSession;
}

export interface SessionReplayEventsIDBStore {
  initialize(): Promise<void>;
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
