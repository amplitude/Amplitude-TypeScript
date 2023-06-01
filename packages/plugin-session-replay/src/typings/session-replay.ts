/* eslint-disable @typescript-eslint/no-empty-interface */
import { EnrichmentPlugin } from '@amplitude/analytics-types';

export interface Options {}

export interface CreateSessionReplayPlugin {
  (options?: Options): EnrichmentPlugin;
}

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
