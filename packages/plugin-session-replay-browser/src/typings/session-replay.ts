import { BrowserClient, EnrichmentPlugin } from '@amplitude/analytics-types';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Options {}

export interface SessionReplayPlugin {
  (client: BrowserClient, options?: Options): EnrichmentPlugin;
  (options?: Options): EnrichmentPlugin;
}

export type SessionReplayPluginParameters = [BrowserClient, Options?] | [Options?];

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
