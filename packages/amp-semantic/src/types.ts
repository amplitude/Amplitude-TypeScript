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
/** Payloads exclude version and identity, which are owned by the runtime. */
export interface SemanticPayloads {
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
  visibility: { state: 'hidden' | 'visible' };
}
export type SemanticFamily = keyof SemanticPayloads;
export type SemanticEvent = {
  [K in SemanticFamily]: { name: K; payload: SemanticPayloads[K] & SemanticIdentity & { v: 1 }; timestamp: number };
}[SemanticFamily];
export interface SemanticCaptureConfig {
  enabled: boolean;
  /** Additional sampling within recorded replay sessions. Defaults to 1. */
  sampleRate?: number;
  /** Registered families are enabled unless explicitly false. */
  families?: Partial<Record<SemanticFamily, boolean>>;
}
export interface HostSignals {
  /** An accepted full snapshot, forwarded after the recorder is ready. */
  snapshot: undefined;
}
export type Cleanup = () => void;
/** The host owns replay transport and privacy configuration; no rrweb dependency. */
export interface SemanticHost {
  document: Document;
  window: Window;
  emit: (event: SemanticEvent) => void;
  getPrivacy: () => PrivacyConfig;
  sdk: string;
  getAnalyticsContext?: () => AnalyticsContext;
  /** Called lazily for accepted events. Defaults to document-scoped memory only. */
  getIdentity?: () => SemanticIdentity;
  inlineStylesheet?: boolean;
  now?: () => number;
  random?: () => number;
  onError?: (error: unknown) => void;
}
export interface RecorderContext {
  /** Register resources immediately so failed setup can roll them back. */
  onCleanup: (cleanup: Cleanup) => void;
  host: SemanticHost;
  now: () => number;
  enabled: (family: SemanticFamily) => boolean;
  /** Check session capacity without counting a dropped event. */
  hasCapacity: (family: SemanticFamily) => boolean;
  /** Check before expensive payload work. A rejected candidate increments the dropped count. */
  canEmit: (family: SemanticFamily) => boolean;
  emit: <K extends SemanticFamily>(family: K, payload: SemanticPayloads[K], timestamp?: number) => boolean;
  on: <K extends keyof HostSignals>(signal: K, callback: (value: HostSignals[K]) => void) => Cleanup;
  subscribe: (callback: (event: SemanticEvent) => void) => Cleanup;
  /** Peek until a context event successfully emits; runtime then clears these counts. */
  dropped: () => Partial<Record<SemanticFamily, number>>;
  /** Preserves page readiness when families are reconfigured mid-recording. */
  hasSnapshot: () => boolean;
}
/** A factory owns its listeners/timers and returns complete teardown. */
export interface SemanticRecorder {
  families: readonly SemanticFamily[];
  setup: (context: RecorderContext) => Cleanup;
}
