import type { PrivacyConfig } from '@amplitude/session-replay-dom-privacy';

export const SEMANTIC_VERSION = 1;
export interface AnalyticsContext {
  present: boolean;
  autocapture: string[];
}
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

/** Payloads exclude version and identity, which are owned by the runtime. */
export interface SemanticPayloads {
  visibility: { state: 'hidden' | 'visible' };
  lifecycle: { type: 'pagehide' | 'pageshow' | 'pageshow_bfcache' | 'freeze' | 'resume' };
  navigation: { url: string };
  context: {
    sdk: string;
    mask: 'light' | 'medium' | 'conservative';
    css: { total: number; inlined: number; unreadable: number };
    viewport: { w: number; h: number };
    device: 'desktop' | 'tablet' | 'mobile';
    language: string;
    visibility_state: 'hidden' | 'visible';
    focused: boolean;
    user_agent: string;
    analytics_sdk: AnalyticsContext;
    caps_hit?: Partial<Record<SemanticFamily, number>>;
  };
}
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
  /** An accepted URL tracking plugin event, after host UGC filtering. */
  url: { url: string; timestamp: number };
}
export type Cleanup = () => void;
/** The host owns transport; the runtime has no rrweb dependency. */
export interface SemanticHost<P extends object = SemanticPayloads> {
  document: Document;
  window: Window;
  sdk: string;
  getPrivacy: () => PrivacyConfig;
  getAnalyticsContext?: () => AnalyticsContext;
  inlineStylesheet?: boolean;
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
  /** Check before expensive payload work. A rejected candidate increments the dropped count. */
  canEmit: (family: SemanticFamily<P>) => boolean;
  emit: <K extends SemanticFamily<P>>(family: K, payload: P[K], timestamp?: number) => boolean;
  on: <K extends keyof HostSignals>(signal: K, callback: (value: HostSignals[K]) => void) => Cleanup;
  /** Peek at dropped counts; a recorder can acknowledge them after successful delivery. */
  dropped: () => Partial<Record<SemanticFamily<P>, number>>;
  clearDropped: () => void;
}
/** A factory owns its listeners/timers and returns complete teardown. */
export interface SemanticRecorder<P extends object = SemanticPayloads> {
  families: readonly SemanticFamily<P>[];
  setup: (context: RecorderContext<P>) => Cleanup;
}
