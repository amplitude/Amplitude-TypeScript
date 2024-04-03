import { AmplitudeReturn, Config, LogLevel, Logger, ServerZone } from '@amplitude/analytics-types';

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
  sessionSequences: {
    [sequenceId: number]: IDBStoreSequence;
  };
}

export interface IDBStore {
  [sessionId: number]: IDBStoreSession;
}

export interface SessionReplayPrivacyConfig {
  blockSelector?: string | string[];
}

export interface SessionReplayConfig extends Config {
  apiKey: string;
  deviceId?: string;
  sessionId?: number;
  loggerProvider: Logger;
  logLevel: LogLevel;
  flushMaxRetries: number;
  sampleRate: number;
  sessionReplayId?: string;
  privacyConfig?: SessionReplayPrivacyConfig;
  debugMode?: boolean;
}

export type SessionReplayOptions = Omit<Partial<SessionReplayConfig>, 'apiKey'>;

export interface AmplitudeSessionReplay {
  init: (apiKey: string, options: SessionReplayOptions) => AmplitudeReturn<void>;
  setSessionId: (sessionId: number) => void;
  getSessionId: () => number | undefined;
  getSessionReplayProperties: () => { [key: string]: boolean | string | null };
  flush: (useRetry: boolean) => Promise<void>;
  shutdown: () => void;
}

export interface SessionReplayTrackDestination {
  sendEventsList: (destinationData: SessionReplayDestination) => void;
  setLoggerProvider: (loggerProvider: Logger) => void;
  flush: (useRetry: boolean) => Promise<void>;
}
