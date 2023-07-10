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

export enum RecordingStatus {
  RECORDING = 'recording',
  SENDING = 'sending',
  SENT = 'sent',
}

export interface IDBStoreSequence {
  events: Events;
  status: RecordingStatus;
}

export interface IDBStore {
  [sessionId: number]: {
    currentSequenceId: number;
    sessionSequences: { [sequenceId: number]: IDBStoreSequence };
  };
}
export interface SessionReplayEnrichmentPlugin extends EnrichmentPlugin {
  setup: (config: BrowserConfig) => Promise<void>;
  config: BrowserConfig;
  storageKey: string;
  retryTimeout: number;
  events: Events;
  currentSequenceId: number;
  interval: number;
  queue: SessionReplayContext[];
  timeAtLastSend: number | null;
  stopRecordingEvents: ReturnType<typeof record> | null;
  maxPersistedEventsSize: number;
  initialize: (shouldSendStoredEvents?: boolean) => Promise<void>;
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
  storeEventsForSession: (events: Events, sequenceId: number, sessionId: number) => Promise<void>;
  cleanUpSessionEventsStore: (sessionId: number, sequenceId: number) => Promise<void>;
}

export interface SessionReplayPlugin {
  (client: BrowserClient, options?: Options): SessionReplayEnrichmentPlugin;
  (options?: Options): SessionReplayEnrichmentPlugin;
}

export type SessionReplayPluginParameters = [BrowserClient, Options?] | [Options?];
