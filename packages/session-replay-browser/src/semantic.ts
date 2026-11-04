import type {
  SemanticCaptureConfig,
  SemanticCaptureController,
  SemanticCaptureFactory,
  SemanticCaptureHost,
} from './semantic-types';

/** Transport startup queue bound, independent of recorder-specific event budgets. */
export const MAX_PENDING_SEMANTIC_SNAPSHOTS = 200;
import { EventType, eventWithTime } from '@amplitude/rrweb-types';

/** Starts capture only after rrweb can accept custom events. */
export class ReplaySemanticAdapter {
  private readonly capture: SemanticCaptureController;
  private sessionId?: string | number;
  private ready = false;
  private pendingSnapshots = 0;
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
    const pending = this.pendingSnapshots;
    this.pendingSnapshots = 0;
    for (let i = 0; i < pending; i++) this.snapshot();
  }

  /** Called only for replay events accepted for delivery; custom events cannot recurse. */
  event(event: eventWithTime): void {
    if (event.type === EventType.FullSnapshot) this.snapshot();
  }

  private snapshot(): void {
    if (!this.config.enabled) return;
    if (!this.ready) {
      // No DOM retention; bound deferred work before the supplied runtime is ready.
      this.pendingSnapshots = Math.min(this.pendingSnapshots + 1, MAX_PENDING_SEMANTIC_SNAPSHOTS);
      return;
    }
    if (this.capture.isActive()) this.capture.notify('snapshot', undefined);
  }

  stop(): void {
    this.ready = false;
    this.pendingSnapshots = 0;
    this.capture.stop();
  }
}
