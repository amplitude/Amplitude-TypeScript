export type Events = string[];

export interface SessionReplayContext {
  events: Events;
  sequenceId: number;
  attempts: number;
  timeout: number;
  sessionId: number;
}

export interface IDBStore {
  [sessionId: number]: {
    events: Events;
    sequenceId: number;
  };
}
