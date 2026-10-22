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
export type NavigationReason = 'load' | 'push' | 'replace' | 'pop' | 'hash' | 'title';
export interface RecordingSignal {
  state: 'start' | 'stop' | 'pause' | 'resume';
  reason: 'init' | 'new_session' | 'customer_stop' | 'sampled_out' | 'opt_out' | 'targeting' | 'focus' | 'error';
}
export interface AnalyticsContext {
  present: boolean;
  autocapture: string[];
}

export interface SemanticIdentity {
  readonly tab_id: string;
  readonly document_id: string;
}

/** Recorder payloads exclude version and identity, which are owned by the capture runtime. */
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
  keys: { key: string; target: TargetDescription };
  'resource-error': {
    rt: 'img' | 'css' | 'font' | 'script';
    count: number;
    container?: TargetDescription;
    path?: string;
  };
  page: {
    url: string;
    title: string | null;
    heading: string | null;
    nav: NavigationReason;
    check: 'change' | '2s' | '5s';
    controls: number;
    empty: boolean;
    loading: boolean;
  };
  field: TargetDescription & {
    kind: string;
    value_state: 'empty' | 'filled';
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
  notice: {
    id: number | null;
    role: 'alert' | 'status' | 'log' | 'live';
    text: string | null;
    visible: boolean;
    region: { role: string; name: string | null } | null;
    cause_click_ts: number | null;
  };
  dialog: TargetDescription & {
    role: 'dialog' | 'alertdialog';
    state: 'open' | 'closed';
    modal: boolean;
    visible: boolean;
    cause_click_ts: number | null;
  };
  recording: RecordingSignal;
  visibility: {
    state: 'hidden' | 'visible';
    trigger: 'visibilitychange';
  };
  lifecycle: { type: 'pagehide' | 'pageshow' | 'pageshow_bfcache' | 'freeze' | 'resume' };
  'amp-event': {
    event_type: string;
    insert_id: string | null;
    id: number | null;
    props: Record<string, string | number | null>;
  };
  'click-outcome': {
    click_ts: number;
    id: number | null;
    window_ms: number;
    navigated: boolean;
    changed: boolean;
    opened: { role: string; name: string | null }[];
    closed: { role: string; name: string | null }[];
    error_text: string | null;
    notice_text: string | null;
    no_change: boolean;
    first_change_ms: number | null;
  };
}
export type SemanticFamily = keyof SemanticPayloads;
export type SemanticEvent = {
  [K in SemanticFamily]: { name: K; payload: SemanticPayloads[K] & SemanticIdentity & { v: 1 }; timestamp: number };
}[SemanticFamily];
export interface SemanticCaptureConfig {
  enabled: boolean;
  sampleRate?: number;
  families?: Partial<Record<SemanticFamily, boolean>>;
}
/** Forward only after analytics enrichment/filtering has accepted this event for delivery. */
export interface AcceptedAnalyticsEvent {
  eventType: string;
  insertId?: string;
  properties: Record<string, unknown>;
  element?: Element;
}
export interface HostSignals {
  snapshot: undefined;
  navigation: NavigationReason;
  recording: RecordingSignal;
  click: MouseEvent;
  analytics: AcceptedAnalyticsEvent;
}
export type Cleanup = () => void;

/** Host dependencies are injected: this package does not import rrweb or an analytics SDK. */
export interface SemanticHost {
  document: Document;
  window: Window;
  emit: (event: SemanticEvent) => void;
  getNodeId: (node: Node) => number;
  getPrivacy: () => PrivacyConfig;
  getUrl: () => string;
  sdk: string;
  getAnalyticsContext?: () => AnalyticsContext;
  /** Stable document identity; called lazily for accepted events. Default is document-scoped memory only. */
  getIdentity?: () => SemanticIdentity;
  getSelector?: (element: Element) => string | null;
  /** True when the host forwards native clicks via notify('click', event). */
  externalClicks?: boolean;
  /** Override when the host supplies primary clicks but not auxclick. Defaults to externalClicks. */
  externalAuxClicks?: boolean;
  /** True when the host forwards navigation; otherwise the page recorder tracks it. */
  externalNavigation?: boolean;
  inlineStylesheet?: boolean;
  now?: () => number;
  random?: () => number;
  onError?: (error: unknown) => void;
}
export interface SemanticHelpers {
  id: (element: Element) => number | null;
  blocked: (element: Element) => boolean;
  masked: (element: Element) => boolean;
  text: (element: Element, value?: string | null, limit?: number) => string | null;
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
export interface RecorderContext {
  /** Register resources immediately so failed setup can roll them back. */
  onCleanup: (cleanup: Cleanup) => void;
  host: SemanticHost;
  helpers: SemanticHelpers;
  now: () => number;
  enabled: (family: SemanticFamily) => boolean;
  /** Check before expensive payload work. A rejected candidate increments the dropped count. */
  canEmit: (family: SemanticFamily) => boolean;
  emit: <K extends SemanticFamily>(family: K, payload: SemanticPayloads[K], timestamp?: number) => boolean;
  on: <K extends keyof HostSignals>(signal: K, callback: (value: HostSignals[K]) => void) => Cleanup;
  subscribe: (callback: (event: SemanticEvent) => void) => Cleanup;
  /** Peek until a context event successfully emits; runtime then clears these counts. */
  dropped: () => Partial<Record<SemanticFamily, number>>;
  /** Preserves page readiness when families are reconfigured mid-recording. */
  hasSnapshot?: () => boolean;
}
/** A factory owns its listeners/timers and returns complete teardown. */
export interface SemanticRecorder {
  families: readonly SemanticFamily[];
  setup: (context: RecorderContext) => Cleanup;
}
