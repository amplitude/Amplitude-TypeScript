import { BrowserClient, BrowserConfig, EnrichmentPlugin } from '@amplitude/analytics-types';
import { record } from 'rrweb';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Options {}

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
export interface SessionReplayEnrichmentPlugin extends EnrichmentPlugin {
  config: BrowserConfig;
  storageKey: string;
  retryTimeout: number;
  events: Events;
  currentSequenceId: number;
  interval: number;
  queue: SessionReplayContext[];
  timeSinceLastSend: number | null;
  stopRecordingEvents: ReturnType<typeof record> | null;
  maxPersistedEventsSize: number;
  emptyStoreAndReset: () => Promise<void>;
  recordEvents: () => void;
  shouldSplitEventsList: (nextEventString: string) => boolean;
  sendEventsList: ({
    events,
    sequenceId,
    sessionId,
  }: {
    events: string[];
    sequenceId: number;
    sessionId: number;
  }) => void;
  addToQueue: (...list: SessionReplayContext[]) => void;
  schedule: (timeout: number) => void;
  flush: (useRetry?: boolean) => Promise<void>;
  send: (context: SessionReplayContext, useRetry?: boolean) => Promise<void>;
  completeRequest({
    context,
    err,
    success,
    removeEvents,
  }: {
    context: SessionReplayContext;
    err?: string | undefined;
    success?: string | undefined;
    removeEvents?: boolean | undefined;
  }): void;
  getAllSessionEventsFromStore: () => Promise<IDBStore | undefined>;
  storeEventsForSession: (events: Events, sequenceId: number) => Promise<void>;
  removeSessionEventsStore: (sessionId: number) => Promise<void>;
}

export interface SessionReplayPlugin {
  (client: BrowserClient, options?: Options): SessionReplayEnrichmentPlugin;
  (options?: Options): SessionReplayEnrichmentPlugin;
}

export type SessionReplayPluginParameters = [BrowserClient, Options?] | [Options?];
