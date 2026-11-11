import type { PrivacyConfig } from '@amplitude/session-replay-dom-privacy';

export const SEMANTIC_VERSION = 1;
export type NameSource =
  | 'aria-labelledby'
  | 'aria-label'
  | 'label-for'
  | 'label-wrap'
  | 'alt'
  | 'value'
  | 'title'
  | 'text'
  | 'placeholder'
  | 'masked'
  | 'unnamed';
export interface TargetDescription {
  id: number | null;
  role: string;
  name: string | null;
}
export interface NamedTarget extends TargetDescription {
  name_source: NameSource;
}
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
  recording: RecordingSignal;
  keys: { key: string; target: NamedTarget & { states: string[] } };
  'resource-error': {
    rt: 'img' | 'css' | 'font' | 'script';
    count: number;
    container?: TargetDescription;
    path?: string;
  };
  notice: {
    id: number | null;
    role: 'alert' | 'status' | 'log' | 'live';
    text: string | null;
    visible: boolean;
    region: { role: string; name: string | null } | null;
    cause_click_ts: number | null;
  };
  dialog: NamedTarget & {
    role: 'dialog' | 'alertdialog';
    state: 'open' | 'closed';
    modal: boolean;
    visible: boolean;
    cause_click_ts: number | null;
  };
  click: NamedTarget & {
    container: TargetDescription | null;
    states: string[];
    visible: boolean;
    key: string | null;
    selector?: string | null;
    attrs: Record<string, string>;
    url: string;
    heading: string | null;
    keyboard: boolean;
    modifiers: string[];
    trusted: boolean;
  };
  field: NamedTarget & {
    states: string[];
    kind: string;
    value_state: 'empty' | 'filled';
    value?: string;
    checked?: boolean;
    valid: boolean;
    validity: string[];
    masked: boolean;
    option_label: string | null;
  };
  submit: {
    form: TargetDescription;
    submitter: TargetDescription | null;
    valid: boolean;
    invalid_fields: { id: number | null; name: string | null; validity: string[] }[];
    prevented: boolean;
  };
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
  dom: SemanticDomChange;
  /** An accepted full snapshot, forwarded after the recorder is ready. */
  snapshot: undefined;
  /** An accepted URL tracking plugin event, after host UGC filtering. */
  url: { url: string; timestamp: number };
  /** SDK-owned recording boundary, forwarded before rrweb teardown. */
  recording: RecordingSignal;
  click: MouseEvent;
}
/** Structural replay input, with no dependency on rrweb implementation types. */
export interface SemanticDomNode {
  id: number;
  type: number;
  tagName?: string;
  attributes?: Record<string, unknown>;
  childNodes?: SemanticDomNode[];
}
export type SemanticDomChange =
  | { type: 'snapshot'; node: SemanticDomNode }
  | {
      type: 'mutation';
      adds: { parentId: number; node: SemanticDomNode }[];
      removes: { parentId: number; id: number }[];
      texts: { id: number }[];
      attributes: { id: number; attributes: Record<string, unknown> }[];
    };
export interface SemanticHelpers {
  id: (element: Element) => number | null;
  blocked: (element: Element) => boolean;
  masked: (element: Element) => boolean;
  text: (element: Element, value?: string | null) => string | null;
  name: (element: Element) => { name: string | null; source: NameSource };
  role: (element: Element) => string;
  states: (element: Element) => string[];
  describe: (element: Element) => NamedTarget;
  actionable: (element: Element) => Element;
  container: (element: Element) => TargetDescription | null;
  visible: (element: Element) => boolean;
  heading: () => string | null;
  invalidateHeading?: () => void;
  url: (value?: string) => string;
  attributes: (element: Element) => Record<string, string>;
}
export interface RecordingSignal {
  state: 'start' | 'stop' | 'pause' | 'resume';
  reason: 'init' | 'new_session' | 'customer_stop' | 'sampled_out' | 'opt_out' | 'targeting' | 'focus' | 'error';
}
export type Cleanup = () => void;
/** The host owns transport; the runtime has no rrweb dependency. */
export interface SemanticHost<P extends object = SemanticPayloads> {
  document: Document;
  window: Window;
  sdk: string;
  getPrivacy: () => PrivacyConfig;
  getAnalyticsContext?: () => AnalyticsContext;
  getNodeId?: (node: Node) => number;
  getNode?: (id: number) => Node | null;
  getUrl?: () => string;
  getSelector?: (element: Element) => string | null;
  /** True when the host forwards native clicks through notify('click'). */
  externalClicks?: boolean;
  /** rrweb's native hook does not cover auxclick; default to a local listener. */
  externalAuxClicks?: boolean;
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
  enabled: (family: SemanticFamily<P>) => boolean;
  /** Read capacity without counting a rejected candidate. */
  hasCapacity: (family: SemanticFamily<P>) => boolean;
  /** Optional test or host override; built-in interaction capture creates helpers lazily. */
  helpers?: SemanticHelpers;
  /** Check before expensive payload work. A rejected candidate increments the dropped count. */
  canEmit: (family: SemanticFamily<P>) => boolean;
  emit: <K extends SemanticFamily<P>>(family: K, payload: P[K], timestamp?: number) => boolean;
  on: <K extends keyof HostSignals>(signal: K, callback: (value: HostSignals[K]) => void) => Cleanup;
  /** Observe successfully emitted events for causal correlation. */
  subscribe: (callback: (event: SemanticEvent<P>) => void) => Cleanup;
  /** Peek at dropped counts; a recorder can acknowledge them after successful delivery. */
  dropped: () => Partial<Record<SemanticFamily<P>, number>>;
  clearDropped: () => void;
}
/** A factory owns its listeners/timers and returns complete teardown. */
export interface SemanticRecorder<P extends object = SemanticPayloads> {
  families: readonly SemanticFamily<P>[];
  setup: (context: RecorderContext<P>) => Cleanup;
}
