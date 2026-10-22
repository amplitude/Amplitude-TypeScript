import { createSemanticCapture, RecordingSignal, SemanticCaptureConfig, SemanticHost } from '@amplitude/amp-semantic';
import { subscribeToUrlChanges } from './plugins/url-tracking-plugin';

/** Bridges recorder startup ordering and the shared URL subscription into semantic capture. */
export class ReplaySemanticAdapter {
  private readonly capture: ReturnType<typeof createSemanticCapture>;
  private sessionId?: string | number;
  private ready = false;
  private firstSnapshot = false;
  private pendingSnapshots = 0;
  private navigationCleanup?: () => void;
  private startSignal: RecordingSignal = { state: 'start', reason: 'init' };
  private resumeReason: RecordingSignal['reason'] = 'focus';
  private config: SemanticCaptureConfig = { enabled: false };

  constructor(
    private readonly host: SemanticHost,
    private readonly diagnostic: (message: string) => void = () => undefined,
  ) {
    this.capture = createSemanticCapture(this.config, { ...host, externalNavigation: true });
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
  }

  /** rrweb may synchronously emit its initial snapshot before returning its cancellation callback. */
  recordingReady(): void {
    if (!this.config.enabled || this.ready) return;
    this.ready = true;
    this.capture.start();
    this.diagnostic(
      this.capture.isActive()
        ? 'active: semantic listeners started.'
        : 'inactive: semantic runtime did not start (check semantic sampling and environment).',
    );
    if (this.capture.isActive() && this.config.families?.page !== false) {
      this.navigationCleanup = subscribeToUrlChanges(this.host.window, () => undefined, {
        onNavigation: (reason) => this.capture.notify('navigation', reason),
      });
    }
    const pending = this.pendingSnapshots;
    this.pendingSnapshots = 0;
    for (let i = 0; i < pending; i++) this.snapshot();
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
    if (this.capture.isActive()) this.diagnostic(`${state}: ${reason}.`);
    const emitStop = this.ready && this.firstSnapshot;
    this.ready = false;
    this.firstSnapshot = false;
    if (emitStop) {
      this.resumeReason = reason;
      this.capture.notify('recording', { state, reason });
    }
    this.navigationCleanup?.();
    this.navigationCleanup = undefined;
    this.capture.stop();
    this.ready = false;
    this.pendingSnapshots = 0;
  }
}
