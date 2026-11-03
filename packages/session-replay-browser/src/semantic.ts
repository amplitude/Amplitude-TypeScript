import { createSemanticCapture, SEMANTIC_CAPS, SemanticCaptureConfig, SemanticHost } from '@amplitude/amp-semantic';
import { EventType, eventWithTime } from '@amplitude/rrweb-types';

/** Starts capture only after rrweb can accept custom events. */
export class ReplaySemanticAdapter {
  private readonly capture: ReturnType<typeof createSemanticCapture>;
  private sessionId?: string | number;
  private ready = false;
  private pendingSnapshots = 0;
  private config: SemanticCaptureConfig = { enabled: false };

  constructor(host: SemanticHost) {
    this.capture = createSemanticCapture(this.config, host);
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
      // No DOM retention; bound startup work by the context event budget.
      this.pendingSnapshots = Math.min(this.pendingSnapshots + 1, SEMANTIC_CAPS.context);
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
