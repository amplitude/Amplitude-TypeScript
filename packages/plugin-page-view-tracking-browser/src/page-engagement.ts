import {
  getGlobalScope,
  BrowserClient,
  Event,
  Heartbeat,
  BrowserConfig,
  ILogger,
  EngagedTimeOptions,
  UUID,
} from '@amplitude/analytics-core';

export const DEFAULT_ENGAGEMENT_THRESHOLD = 5_000;
export const DEFAULT_ENGAGEMENT_HEARTBEAT = 15_000;
export const DEFAULT_PAGE_SESSION_TIMEOUT = 180_000;

interface PageSession {
  event: Event;
  heartbeat: Heartbeat;
  started: number;
  updated: number;
  lastActivity: number;
  engaged: number;
  version: number;
  lastQueuedVersion: number;
  nextSnapshotReason: 'initial' | 'heartbeat' | 'background';
}

// Browser timers use a signed 32-bit millisecond delay. Larger values can overflow.
const MAX_TIMER_DELAY_MILLIS = 2_147_483_647;
// The delayed-event service rejects request timeouts greater than 24 hours.
const MAX_PAGE_SESSION_TIMEOUT_MILLIS = 86_400_000;

function resolveDurationMillis(
  value: number | undefined,
  defaultValue: number,
  logger: ILogger,
  maximum = MAX_TIMER_DELAY_MILLIS,
): number {
  if (value === undefined) return defaultValue;
  if (!Number.isFinite(value) || value <= 0 || value > maximum) {
    logger.warn(
      `Page engagement: duration ${value} ms is invalid; using default ${defaultValue} ms. Expected a finite value greater than 0 and at most ${maximum} ms.`,
    );
    return defaultValue;
  }
  return value;
}

/** Owns one page-view delay group at a time, independently of the video heartbeat. */
export class PageEngagement {
  private session?: PageSession;
  private inactivityTimer?: ReturnType<typeof setTimeout>;
  private foreground: boolean;
  private enabled = true;
  private skippedPage = false;
  private readonly threshold: number;
  private readonly pulse: number;
  private readonly timeout: number;
  private readonly removeListeners: (() => void)[] = [];

  constructor(
    private client: BrowserClient,
    private scope: NonNullable<ReturnType<typeof getGlobalScope>>,
    options: EngagedTimeOptions,
    private config: BrowserConfig,
    private newPageView: () => void,
  ) {
    this.timeout = resolveDurationMillis(
      options.pageSessionTimeoutMillis,
      DEFAULT_PAGE_SESSION_TIMEOUT,
      config.loggerProvider,
      MAX_PAGE_SESSION_TIMEOUT_MILLIS,
    );
    this.threshold = resolveDurationMillis(
      options.engagementThresholdMillis,
      DEFAULT_ENGAGEMENT_THRESHOLD,
      config.loggerProvider,
    );
    this.pulse = Math.min(
      resolveDurationMillis(options.heartbeatIntervalMillis, DEFAULT_ENGAGEMENT_HEARTBEAT, config.loggerProvider),
      this.timeout / 2,
    );
    this.foreground = this.isForeground();
    const listen = (target: EventTarget, type: string, listener: EventListener) => {
      target.addEventListener(type, listener, { passive: true });
      this.removeListeners.push(() => target.removeEventListener(type, listener));
    };
    for (const type of ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel']) {
      listen(scope.document, type, this.activity);
    }
    listen(scope, 'focus', this.resume);
    listen(scope, 'blur', this.pause);
    listen(scope.document, 'visibilitychange', () => (this.isForeground() ? this.resume() : this.pause()));
    // Leaving the document always ends this view, including entry into BFCache.
    listen(scope, 'pagehide', () => this.finish('pagehide'));
    listen(scope, 'pageshow', () => {
      // A restored page starts a fresh view through the existing activity path.
      if (this.isForeground()) this.resume();
    });
  }

  private isForeground() {
    return this.scope.document.visibilityState === 'visible' && this.scope.document.hasFocus();
  }

  start(event: Event): boolean {
    this.finish('navigation');
    if (!this.enabled) return false;
    const now = Date.now();
    this.foreground = this.isForeground();
    const session: PageSession = {
      event: {
        ...event,
        insert_id: event.insert_id || UUID(),
        time: event.time ?? now,
        event_properties: { ...event.event_properties },
        // Share the SDK inactivity duration with the service fallback. The SDK counts
        // from last activity; the service counts from the last accepted heartbeat.
        delay: { id: UUID(), timeout: this.timeout },
      },
      heartbeat: new Heartbeat(this.client, this.pulse, this.timeout, this.config.loggerProvider, {
        // This owner settles elapsed time and finalizes before sending.
        // Avoid a second set of lifecycle sends.
        sendOnPageLifecycle: false,
        beforeHeartbeat: () => {
          if (this.session === session) {
            if (Date.now() >= session.lastActivity + this.timeout) {
              this.retire(session, 'inactivity');
            } else {
              void session.heartbeat.update(this.snapshot(session, session.nextSnapshotReason));
              session.nextSnapshotReason = 'heartbeat';
            }
          }
        },
      }),
      started: now,
      updated: now,
      lastActivity: now,
      engaged: 0,
      version: 0,
      lastQueuedVersion: 0,
      nextSnapshotReason: 'initial',
    };
    if (!session.heartbeat.enqueue(this.snapshot(session, 'initial'))) {
      // Do not turn subsequent activity on this page into repeated fallback views.
      this.skippedPage = true;
      this.config.loggerProvider.warn(
        'Page engagement: snapshot exceeds the Heartbeat size limit. Sending the original page view without engaged-time tracking.',
      );
      return false;
    }
    this.session = session;
    this.scheduleInactivity();
    void session.heartbeat.resetHeartbeat();
    return true;
  }

  private settle(session: PageSession) {
    // Cap a late callback at the inactivity deadline; heartbeats never extend it.
    const now = Math.max(session.updated, Math.min(Date.now(), session.lastActivity + this.timeout));
    if (this.foreground) {
      session.engaged += Math.max(0, Math.min(now, session.lastActivity + this.threshold) - session.updated);
    }
    session.updated = now;
  }

  private snapshot(session: PageSession, reason: string): Event {
    this.settle(session);
    const version = ++session.version;
    return {
      ...session.event,
      delay: {
        ...session.event.delay!,
        acceptSnapshot: () => {
          // Compare with the last copy that reached Destination, so a slow plugin
          // can still deliver snapshots while newer copies are being constructed.
          if (version < session.lastQueuedVersion) return false;
          session.lastQueuedVersion = version;
          return true;
        },
      },
      // Prototype taxonomy; SDK-392 tracks final customer-facing names and units.
      event_properties: {
        ...session.event.event_properties,
        '[Amplitude] Engaged Time': session.engaged,
        '[Amplitude] Total Time': session.updated - session.started,
        // Internal diagnostics; version counts constructed snapshots, not requests.
        '[Amplitude] Snapshot Version': version,
        '[Amplitude] Engagement Snapshot Reason': reason,
      },
    };
  }

  private scheduleInactivity() {
    clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => this.finish('inactivity'), this.timeout);
  }

  private activity = () => {
    if (
      !this.enabled ||
      this.skippedPage ||
      !this.foreground ||
      (this.scope.document as Document & { prerendering?: boolean }).prerendering
    )
      return;
    if (this.session && Date.now() >= this.session.lastActivity + this.timeout) this.finish('inactivity');
    if (!this.session) {
      this.newPageView();
      return;
    }
    this.settle(this.session);
    this.session.lastActivity = Date.now();
    this.scheduleInactivity();
  };

  private resume = () => {
    if (this.scope.document.visibilityState !== 'visible') return;
    if (this.session) this.settle(this.session);
    this.foreground = true;
    this.activity();
  };

  private pause = () => {
    if (this.session) this.settle(this.session);
    this.foreground = false;
    if (this.session) {
      this.session.nextSnapshotReason = 'background';
      void this.session.heartbeat.heartbeat();
      this.client.flush();
    }
  };

  private retire(session: PageSession, reason: string) {
    clearTimeout(this.inactivityTimer);
    const event = this.snapshot(session, reason);
    event.delay = { ...event.delay!, timeout: undefined };
    void session.heartbeat.update(event);
    session.heartbeat.pause();
    this.session = undefined;
  }

  finish(reason: string) {
    this.skippedPage = false;
    const session = this.session;
    if (!session) return;
    this.retire(session, reason);
    // Enqueue the final copy before clearing this page's heartbeat. Destination
    // coalesces pending snapshots and preserves in-flight ordering by delay ID.
    void session.heartbeat.heartbeat();
    // Request delivery before waiting for ingestion, especially during page exit.
    this.client.flush();
    session.heartbeat.stop();
  }

  setOptOut(optOut: boolean) {
    this.enabled = !optOut;
    if (optOut) {
      this.skippedPage = false;
      clearTimeout(this.inactivityTimer);
      this.session?.heartbeat.stop();
      this.session = undefined;
    }
  }

  teardown() {
    this.finish('teardown');
    this.enabled = false;
    this.removeListeners.forEach((remove) => remove());
  }
}
