import type { PrivacyConfig } from '@amplitude/session-replay-dom-privacy';

/** Serializable controls; remote configuration cannot supply executable code. */
export interface SemanticCaptureConfig {
  enabled: boolean;
  sampleRate?: number;
  families?: Partial<Record<string, boolean>>;
}
export interface SemanticAnalyticsContext {
  present: boolean;
  autocapture: string[];
}
export interface SemanticIdentity {
  readonly tab_id: string;
  readonly document_id: string;
}
/** Structural contract keeps the semantic implementation out of the replay SDK. */
export interface SemanticCaptureHost {
  document: Document;
  window: Window;
  sdk: string;
  emit: (event: { name: string; timestamp: number; payload: object }) => void;
  getPrivacy: () => PrivacyConfig;
  getIdentity?: () => SemanticIdentity;
  getAnalyticsContext?: () => SemanticAnalyticsContext;
  inlineStylesheet?: boolean;
  onError?: (error: unknown) => void;
}
export interface SemanticCaptureController {
  isActive: () => boolean;
  start: () => void;
  stop: () => void;
  updateConfig: (config: SemanticCaptureConfig) => void;
  resetSession: () => void;
  notify: <K extends keyof SemanticHostSignals>(signal: K, value: SemanticHostSignals[K]) => void;
}
/** Structural host signals shared with optional semantic capture implementations. */
export interface SemanticHostSignals {
  snapshot: undefined;
  url: { url: string; timestamp: number };
  recording: SemanticRecordingSignal;
}
export interface SemanticRecordingSignal {
  state: 'start' | 'stop' | 'pause' | 'resume';
  reason: 'init' | 'new_session' | 'customer_stop' | 'sampled_out' | 'opt_out' | 'targeting' | 'focus' | 'error';
}
export type SemanticCaptureFactory = (
  config: SemanticCaptureConfig,
  host: SemanticCaptureHost,
) => SemanticCaptureController;
export interface SemanticCaptureOptions extends SemanticCaptureConfig {
  /** Local implementation. No semantic capture runs without a supplied createCapture callback. */
  createCapture?: SemanticCaptureFactory;
}
