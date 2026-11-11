import type {
  SemanticCaptureConfig,
  SemanticCaptureController,
  SemanticCaptureFactory,
  SemanticCaptureHost,
  SemanticRecordingSignal,
  SemanticDomChange,
  SemanticDomNode,
} from './semantic-types';

/** Transport startup queue bound, independent of recorder-specific event budgets. */
export const MAX_PENDING_SEMANTIC_SNAPSHOTS = 200;
export const MAX_PENDING_SEMANTIC_DOM_CHANGES = 128;
import { EventType, IncrementalSource, eventWithTime } from '@amplitude/rrweb-types';

type DeferredObservation =
  | { type: 'snapshot' }
  | { type: 'url'; url: string; timestamp: number }
  | { type: 'dom'; change: SemanticDomChange };

/** Starts capture only after rrweb can accept custom events. */
export class ReplaySemanticAdapter {
  private readonly capture: SemanticCaptureController;
  private sessionId?: string | number;
  private ready = false;
  private firstSnapshot = false;
  private hasStartedInSession = false;
  private startSignal: SemanticRecordingSignal = { state: 'start', reason: 'init' };
  private resumeReason: SemanticRecordingSignal['reason'] = 'focus';
  private pendingSnapshots = 0;
  private pendingUrls = 0;
  private pendingDomChanges = 0;
  private pendingEvents: DeferredObservation[] = [];
  private config: SemanticCaptureConfig = { enabled: false };

  constructor(readonly createCapture: SemanticCaptureFactory, host: SemanticCaptureHost) {
    this.capture = createCapture(this.config, host);
  }

  prepare(config: SemanticCaptureConfig, sessionId: string | number): void {
    this.stop();
    const newSession = this.sessionId !== sessionId;
    const startReason = this.sessionId === undefined ? 'init' : newSession ? 'new_session' : this.startSignal.reason;
    this.config = config;
    this.capture.updateConfig(config);
    if (newSession) {
      this.capture.resetSession();
      this.hasStartedInSession = false;
    }
    this.startSignal = {
      state: this.hasStartedInSession ? 'resume' : 'start',
      reason: this.hasStartedInSession ? this.resumeReason : startReason,
    };
    this.sessionId = sessionId;
  }

  recordingReady(): void {
    if (!this.config.enabled || this.ready) return;
    this.ready = true;
    this.capture.start();
    const pending = this.pendingEvents;
    this.pendingEvents = [];
    this.pendingSnapshots = 0;
    this.pendingUrls = 0;
    this.pendingDomChanges = 0;
    for (const event of pending) {
      if (event.type === 'snapshot') this.snapshot();
      else if (event.type === 'url') this.url(event.url, event.timestamp);
      else this.dom(event.change);
    }
  }

  /** Called only for replay events accepted for delivery; custom events cannot recurse. */
  event(event: eventWithTime): void {
    if (event.type === EventType.FullSnapshot) {
      if (event.data?.node) this.dom({ type: 'snapshot', node: event.data.node as SemanticDomNode });
      this.snapshot();
    }
    if (event.type === EventType.IncrementalSnapshot && event.data.source === IncrementalSource.Mutation) {
      this.dom({ ...event.data, type: 'mutation' } as SemanticDomChange);
    }
    if (event.type === EventType.Plugin && event.data.plugin === 'amplitude/url-tracking@1') {
      const payload = event.data.payload as { type?: unknown; href?: unknown } | null;
      if (payload?.type === 'url-change-event' && typeof payload.href === 'string') {
        this.url(payload.href, event.timestamp);
      }
    }
  }

  click(event: MouseEvent): void {
    if (this.ready && this.capture.isActive()) this.capture.notify('click', event);
  }

  private dom(change: SemanticDomChange): void {
    const families = this.config.families;
    if (!this.config.enabled || (families && families.notice === false && families.dialog === false)) return;
    if (!this.ready) {
      if (this.pendingDomChanges < MAX_PENDING_SEMANTIC_DOM_CHANGES) {
        this.pendingDomChanges++;
        this.pendingEvents.push({ type: 'dom', change });
      }
      return;
    }
    if (this.capture.isActive()) this.capture.notify('dom', change);
  }

  private url(url: string, timestamp: number): void {
    if (!this.config.enabled) return;
    if (!this.ready) {
      if (this.pendingUrls < MAX_PENDING_SEMANTIC_SNAPSHOTS) {
        this.pendingUrls++;
        this.pendingEvents.push({ type: 'url', url, timestamp });
      }
      return;
    }
    if (this.capture.isActive()) this.capture.notify('url', { url, timestamp });
  }

  private snapshot(): void {
    if (!this.config.enabled) return;
    if (!this.ready) {
      // No DOM retention; bound deferred work before the supplied runtime is ready.
      if (this.pendingSnapshots < MAX_PENDING_SEMANTIC_SNAPSHOTS) {
        this.pendingSnapshots++;
        this.pendingEvents.push({ type: 'snapshot' });
      }
      return;
    }
    if (!this.capture.isActive()) return;
    if (!this.firstSnapshot) {
      this.firstSnapshot = true;
      this.hasStartedInSession = true;
      this.capture.notify('recording', this.startSignal);
    }
    this.capture.notify('snapshot', undefined);
  }

  stop(reason: SemanticRecordingSignal['reason'] = 'targeting', state: 'stop' | 'pause' = 'stop'): void {
    if (this.ready && this.firstSnapshot) {
      this.resumeReason = reason;
      this.capture.notify('recording', { state, reason });
    }
    this.ready = false;
    this.firstSnapshot = false;
    this.pendingSnapshots = 0;
    this.pendingUrls = 0;
    this.pendingDomChanges = 0;
    this.pendingEvents = [];
    this.capture.stop();
  }
}
