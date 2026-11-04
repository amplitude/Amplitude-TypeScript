export const SEMANTIC_VERSION = 1;
export interface SemanticIdentity {
  readonly tab_id: string;
  readonly document_id: string;
}
/** Internal event envelope, independent of any event family or replay transport. */
export interface SemanticEventEnvelope<Name extends string, Payload extends object> {
  name: Name;
  timestamp: number;
  payload: Payload & SemanticIdentity & { v: typeof SEMANTIC_VERSION };
}

/** Runtime consumers supply a map of event names to payload objects. */
export type SemanticPayloads = Record<string, object>;
export type SemanticFamily<P extends object = SemanticPayloads> = Extract<keyof P, string>;
export type SemanticEvent<P extends object = SemanticPayloads> = {
  [K in SemanticFamily<P>]: SemanticEventEnvelope<K, P[K] & object>;
}[SemanticFamily<P>];
export interface SemanticCaptureConfig<P extends object = SemanticPayloads> {
  enabled: boolean;
  /** Additional sampling within recorded replay sessions. Defaults to 1. */
  sampleRate?: number;
  /** Registered families are enabled unless explicitly false. */
  families?: Partial<Record<SemanticFamily<P>, boolean>>;
}
export interface HostSignals {
  /** An accepted full snapshot, forwarded after the recorder is ready. */
  snapshot: undefined;
}
export type Cleanup = () => void;
/** The host owns transport; the runtime has no rrweb dependency. */
export interface SemanticHost<P extends object = SemanticPayloads> {
  document: Document;
  window: Window;
  emit: (event: SemanticEvent<P>) => void;
  /** Called lazily for accepted events. Defaults to document-scoped memory only. */
  getIdentity?: () => SemanticIdentity;
  now?: () => number;
  random?: () => number;
  onError?: (error: unknown) => void;
}
export interface RecorderContext<P extends object = SemanticPayloads> {
  /** Register resources immediately so failed setup can roll them back. */
  onCleanup: (cleanup: Cleanup) => void;
  host: SemanticHost<P>;
  now: () => number;
  enabled: (family: SemanticFamily<P>) => boolean;
  /** Check session capacity without counting a dropped event. */
  hasCapacity: (family: SemanticFamily<P>) => boolean;
  /** Check before expensive payload work. A rejected candidate increments the dropped count. */
  canEmit: (family: SemanticFamily<P>) => boolean;
  emit: <K extends SemanticFamily<P>>(family: K, payload: P[K], timestamp?: number) => boolean;
  on: <K extends keyof HostSignals>(signal: K, callback: (value: HostSignals[K]) => void) => Cleanup;
  subscribe: (callback: (event: SemanticEvent<P>) => void) => Cleanup;
  /** Peek at dropped counts; a recorder can acknowledge them after successful delivery. */
  dropped: () => Partial<Record<SemanticFamily<P>, number>>;
  clearDropped: () => void;
  /** Preserves page readiness when families are reconfigured mid-recording. */
  hasSnapshot: () => boolean;
}
/** A factory owns its listeners/timers and returns complete teardown. */
export interface SemanticRecorder<P extends object = SemanticPayloads> {
  families: readonly SemanticFamily<P>[];
  setup: (context: RecorderContext<P>) => Cleanup;
}
