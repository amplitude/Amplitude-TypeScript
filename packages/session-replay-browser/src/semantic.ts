import type {
  SemanticCaptureConfig,
  SemanticCaptureController,
  SemanticCaptureFactory,
  SemanticCaptureHost,
} from './semantic-types';

/** Transport startup queue bound, independent of recorder-specific event budgets. */
export const MAX_PENDING_SEMANTIC_SNAPSHOTS = 200;
import { EventType, eventWithTime } from '@amplitude/rrweb-types';

type DeferredObservation = { type: 'snapshot' } | { type: 'url'; url: string; timestamp: number };

/** Starts capture only after rrweb can accept custom events. */
export class ReplaySemanticAdapter {
  private readonly capture: SemanticCaptureController;
  private sessionId?: string | number;
  private ready = false;
  private pendingSnapshots = 0;
  private pendingUrls = 0;
  private pendingEvents: DeferredObservation[] = [];
  private config: SemanticCaptureConfig = { enabled: false };

  constructor(readonly createCapture: SemanticCaptureFactory, host: SemanticCaptureHost) {
    this.capture = createCapture(this.config, host);
  }

  prepare(config: SemanticCaptureConfig, sessionId: string | number): void {
    this.stop();
    this.config = config;
    this.capture.updateConfig(config);
    if (this.sessionId !== sessionId) this.capture.resetSession();
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
    for (const event of pending) {
      if (event.type === 'snapshot') this.snapshot();
      else this.url(event.url, event.timestamp);
    }
  }

  /** Called only for replay events accepted for delivery; custom events cannot recurse. */
  event(event: eventWithTime): void {
    if (event.type === EventType.FullSnapshot) this.snapshot();
    if (event.type === EventType.Plugin && event.data.plugin === 'amplitude/url-tracking@1') {
      const payload = event.data.payload as { type?: unknown; href?: unknown } | null;
      if (payload?.type === 'url-change-event' && typeof payload.href === 'string') {
        this.url(payload.href, event.timestamp);
      }
    }
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
    if (this.capture.isActive()) this.capture.notify('snapshot', undefined);
  }

  stop(): void {
    this.ready = false;
    this.pendingSnapshots = 0;
    this.pendingUrls = 0;
    this.pendingEvents = [];
    this.capture.stop();
  }
}
