import { AmplitudeReturn, Config, LogLevel, Logger, ServerZone } from '@amplitude/analytics-types';
import { TargetingFlag } from '@amplitude/targeting';

export type Events = string[];

export interface SessionReplayRemoteConfig {
  sr_targeting_config: TargetingFlag;
}

export interface SessionReplayDestination {
  events: Events;
  sequenceId: number;
  sessionId: number;
  flushMaxRetries?: number;
  apiKey?: string;
  deviceId?: string;
  sampleRate: number;
  serverZone?: keyof typeof ServerZone;
  onComplete: (sessionId: number, sequenceId: number) => Promise<void>;
}

export interface SessionReplayDestinationContext extends SessionReplayDestination {
  attempts: number;
  timeout: number;
}

export enum RecordingStatus {
  RECORDING = 'recording',
  SENT = 'sent',
}

export interface IDBStoreSequence {
  events: Events;
  status: RecordingStatus;
}

export interface IDBStoreSession {
  currentSequenceId: number;
  remoteConfig?: SessionReplayRemoteConfig;
  sessionSequences: {
    [sequenceId: number]: IDBStoreSequence;
  };
}

export interface IDBStore {
  [sessionId: number]: IDBStoreSession;
}

export interface SessionReplaySessionIDBStore {
  getAllSessionDataFromStore(): Promise<IDBStore | undefined>;
  storeEventsForSession(events: Events, sequenceId: number, sessionId: number): Promise<void>;
  storeRemoteConfigForSession(sessionId: number, remoteConfig: SessionReplayRemoteConfig): Promise<void>;
  getRemoteConfigForSession(sessionId: number): Promise<SessionReplayRemoteConfig | void>;
  cleanUpSessionEventsStore(sessionId: number, sequenceId: number): Promise<void>;
}

export interface SessionReplayPrivacyConfig {
  blockSelector?: string | string[];
}

export interface SessionReplayConfig extends Config {
  apiKey: string;
  loggerProvider: Logger;
  logLevel: LogLevel;
  flushMaxRetries: number;
  sampleRate: number;
  privacyConfig?: SessionReplayPrivacyConfig;
  debugMode?: boolean;
}

export interface SessionIdentifiers {
  deviceId?: string;
  sessionId?: number;
  sessionReplayId?: string;
}

export type SessionReplayOptions = Omit<Partial<SessionReplayConfig & SessionIdentifiers>, 'apiKey'>;

export interface AmplitudeSessionReplay {
  init: (apiKey: string, options: SessionReplayOptions) => AmplitudeReturn<void>;
  setSessionId: (sessionId: number, deviceId?: string) => void;
  getSessionId: () => number | undefined;
  getSessionReplayProperties: () => { [key: string]: boolean | string | null };
  flush: (useRetry: boolean) => Promise<void>;
  shutdown: () => void;
}

export interface SessionReplayTrackDestination {
  sendEventsList: (destinationData: SessionReplayDestination) => void;
  flush: (useRetry: boolean) => Promise<void>;
}

export interface SessionReplayRemoteConfigFetch {
  getRemoteConfig: (sessionId: number) => Promise<SessionReplayRemoteConfig | void>;
  getTargetingConfig: (sessionId: number) => Promise<TargetingFlag | void>;
}
export interface SessionReplayRemoteConfig {
  sr_targeting_config: TargetingFlag;
}

export interface SessionReplayEventsManager {
  initialize({
    sessionId,
    shouldSendStoredEvents,
    deviceId,
  }: {
    sessionId: number;
    shouldSendStoredEvents: boolean;
    deviceId: string;
  }): Promise<void>;
  addEvent({ sessionId, event, deviceId }: { sessionId: number; event: string; deviceId: string }): void;
  sendEvents({ sessionId, deviceId }: { sessionId: number; deviceId: string }): void;
  resetSequence(): void;
  flush(useRetry?: boolean): Promise<void>;
  events: Events;
}
