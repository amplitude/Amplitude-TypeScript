import { BrowserConfig, EnrichmentPlugin } from '@amplitude/analytics-types';
import { record } from 'rrweb';

export interface SessionReplayOptions {
  sampleRate?: number;
}

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

export interface IDBStoreSession {
  shouldRecord: boolean;
  currentSequenceId: number;
  sessionSequences: {
    [sequenceId: number]: IDBStoreSequence;
  };
}

export interface IDBStore {
  [sessionId: number]: IDBStoreSession;
}
export interface SessionReplayEnrichmentPlugin extends EnrichmentPlugin {
  setup: (config: BrowserConfig) => Promise<void>;
  config: BrowserConfig;
  storageKey: string;
  retryTimeout: number;
  events: Events;
  currentSequenceId: number;
  interval: number;
  shouldRecord: boolean;
  queue: SessionReplayContext[];
  timeAtLastSend: number | null;
  stopRecordingEvents: ReturnType<typeof record> | null;
  maxPersistedEventsSize: number;
  initialize: (shouldSendStoredEvents?: boolean) => Promise<void>;
  setShouldRecord: (sessionStore?: IDBStoreSession) => void;
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
  storeShouldRecordForSession: (sessionId: number, shouldRecord: boolean) => Promise<void>;
  cleanUpSessionEventsStore: (sessionId: number, sequenceId: number) => Promise<void>;
}

export interface SessionReplayPlugin {
  (options?: SessionReplayOptions): SessionReplayEnrichmentPlugin;
}
