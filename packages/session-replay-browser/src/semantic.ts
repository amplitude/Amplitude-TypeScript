import { createSemanticCapture, RecordingSignal, SemanticCaptureConfig, SemanticHost } from '@amplitude/amp-semantic';
import { EventType, IncrementalSource, eventWithTime } from '@amplitude/rrweb-types';
import type { URLChangeEvent } from './plugins/url-tracking-plugin';

/** Bridges accepted recorder events and startup ordering into semantic capture. */
export class ReplaySemanticAdapter {
  private readonly capture: ReturnType<typeof createSemanticCapture>;
  private sessionId?: string | number;
  private ready = false;
  private firstSnapshot = false;
  private pendingSnapshots = 0;
  private pendingEvents: eventWithTime[] = [];
  private startSignal: RecordingSignal = { state: 'start', reason: 'init' };
  private resumeReason: RecordingSignal['reason'] = 'focus';
  private config: SemanticCaptureConfig = { enabled: false };

  constructor(host: SemanticHost) {
    this.capture = createSemanticCapture(this.config, host);
  }

  prepare(config: SemanticCaptureConfig, sessionId: string | number): void {
    const newSession = this.sessionId !== sessionId;
    const firstSession = this.sessionId === undefined;
    this.config = config;
    this.capture.updateConfig(config);
    if (newSession) this.capture.resetSession();
    this.startSignal = {
      state: newSession ? 'start' : 'resume',
      reason: firstSession ? 'init' : newSession ? 'new_session' : this.resumeReason,
    };
    this.sessionId = sessionId;
    this.ready = false;
    this.firstSnapshot = false;
    this.pendingSnapshots = 0;
    this.pendingEvents = [];
  }

  /** rrweb may synchronously emit its initial snapshot before returning its cancellation callback. */
  recordingReady(): void {
    if (!this.config.enabled || this.ready) return;
    this.ready = true;
    this.capture.start();
    const events = this.pendingEvents;
    this.pendingEvents = [];
    for (const event of events) this.event(event);
    const pending = this.pendingSnapshots;
    this.pendingSnapshots = 0;
    for (let i = 0; i < pending; i++) this.snapshot();
  }

  /** Called only after the underlying replay event is accepted for delivery. */
  event(event: eventWithTime): void {
    if (!this.config.enabled) return;
    const snapshot = event.type === EventType.FullSnapshot;
    const mutation = event.type === EventType.IncrementalSnapshot && event.data.source === IncrementalSource.Mutation;
    const payload =
      event.type === EventType.Plugin && event.data.plugin === 'amplitude/url-tracking@1'
        ? (event.data.payload as Partial<URLChangeEvent> | null)
        : undefined;
    const url =
      payload && typeof payload === 'object' && payload.type === 'url-change-event' && typeof payload.href === 'string'
        ? payload.href
        : undefined;
    if (!snapshot && !mutation && url === undefined) return;
    if (!this.ready) {
      // Startup is synchronous; retain a bounded number of recorder events until start().
      if (this.pendingEvents.length < 128) this.pendingEvents.push(event);
      return;
    }
    if (!this.capture.isActive()) return;
    if (url !== undefined) {
      this.capture.notify('url', { url, timestamp: event.timestamp });
    } else if (event.type === EventType.FullSnapshot) {
      this.capture.notify('dom', { type: 'snapshot', node: event.data.node });
      this.snapshot();
    } else if (event.type === EventType.IncrementalSnapshot && event.data.source === IncrementalSource.Mutation) {
      this.capture.notify('dom', { ...event.data, type: 'mutation' });
    }
  }

  click(event: MouseEvent): void {
    if (this.ready) this.capture.notify('click', event);
  }

  snapshot(): void {
    if (!this.config.enabled) return;
    if (!this.ready) {
      this.pendingSnapshots++;
      return;
    }
    if (!this.firstSnapshot) {
      this.firstSnapshot = true;
      this.capture.notify('recording', this.startSignal);
    }
    this.capture.notify('snapshot', undefined);
  }

  stop(reason: RecordingSignal['reason'] = 'targeting', state: 'stop' | 'pause' = 'stop'): void {
    const emitStop = this.ready && this.firstSnapshot;
    this.ready = false;
    this.firstSnapshot = false;
    if (emitStop) {
      this.resumeReason = reason;
      this.capture.notify('recording', { state, reason });
    }
    this.capture.stop();
    this.pendingEvents = [];
    this.ready = false;
    this.pendingSnapshots = 0;
  }
}
