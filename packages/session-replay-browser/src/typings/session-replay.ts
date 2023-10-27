import { AmplitudeReturn, Config, LogLevel, Logger } from '@amplitude/analytics-types';

export type Events = string[];

export interface SessionReplayContext {
  events: Events;
  sequenceId: number;
  attempts: number;
  timeout: number;
  sessionId: number;
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

export interface SessionReplayConfig extends Config {
  apiKey: string;
  deviceId?: string;
  sessionId?: number;
  loggerProvider: Logger;
  logLevel: LogLevel;
  flushMaxRetries: number;
  sampleRate: number;
}

export type SessionReplayOptions = Omit<Partial<SessionReplayConfig>, 'apiKey'>;

export interface AmplitudeSessionReplay {
  init: (apiKey: string, options: SessionReplayOptions) => AmplitudeReturn<void>;
  setSessionId: (sessionId: number) => void;
  getSessionRecordingProperties: () => { [key: string]: boolean };
  getSessionReplayProperties: () => { [key: string]: boolean };
  shutdown: () => void;
}