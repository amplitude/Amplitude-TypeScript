import { SessionReplayRemoteConfig } from '../config/types';
import { Events } from '../typings/session-replay';

export enum RecordingStatus {
  RECORDING = 'recording',
  SENT = 'sent',
}

export interface IDBStoreSequence {
  events: Events;
  status: RecordingStatus;
}

interface IDBRemoteConfig {
  config: SessionReplayRemoteConfig;
  lastFetchedSessionId: number | undefined;
}
export interface IDBStoreSession {
  currentSequenceId: number;
  sessionSequences: {
    [sequenceId: number]: IDBStoreSequence;
  };
}

export interface IDBStore {
  remoteConfig?: IDBRemoteConfig;
  [sessionId: number]: IDBStoreSession;
}
