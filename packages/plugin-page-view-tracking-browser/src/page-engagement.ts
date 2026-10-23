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

export const DEFAULT_ACTIVITY_WINDOW = 5_000;
export const DEFAULT_ENGAGEMENT_HEARTBEAT = 15_000;
export const DEFAULT_INACTIVITY_TIMEOUT = 180_000;

interface PageState {
  event: Event;
  heartbeat: Heartbeat;
  started: number;
  updated: number;
  lastActivity: number;
  engaged: number;
  version: number;
  nextSnapshotReason: 'initial' | 'heartbeat' | 'background';
}

// Browser timers use a signed 32-bit millisecond delay. Larger values can overflow.
const MAX_TIMER_DELAY_MILLIS = 2_147_483_647;
// The delayed-event service rejects request timeouts greater than 24 hours.
const MAX_INACTIVITY_TIMEOUT_MILLIS = 86_400_000;

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
  private pageState?: PageState;
  private inactivityTimer?: ReturnType<typeof setTimeout>;
  private foreground: boolean;
  private enabled = true;
  private skippedPage = false;
  private readonly activityWindow: number;
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
      options.inactivityTimeoutMillis,
      DEFAULT_INACTIVITY_TIMEOUT,
      config.loggerProvider,
      MAX_INACTIVITY_TIMEOUT_MILLIS,
    );
    this.activityWindow = resolveDurationMillis(
      options.activityWindowMillis,
      DEFAULT_ACTIVITY_WINDOW,
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
    const pageState: PageState = {
      event: {
        ...event,
        insert_id: event.insert_id || UUID(),
        time: event.time ?? now,
        // Share the SDK inactivity duration with the service fallback. The SDK counts
        // from last activity; the service counts from the last accepted heartbeat.
        delay: { id: UUID(), timeout: this.timeout },
      },
      heartbeat: new Heartbeat(this.client, this.pulse, this.timeout, this.config.loggerProvider, {
        // This owner settles elapsed time and finalizes before sending.
        // Avoid a second set of lifecycle sends.
        sendOnPageLifecycle: false,
        beforeHeartbeat: () => {
          // A heartbeat scheduled by the previous page must not update the new page state.
          if (this.pageState === pageState) {
            if (Date.now() >= pageState.lastActivity + this.timeout) {
              this.retire(pageState, 'inactivity');
            } else {
              void pageState.heartbeat.update(this.snapshot(pageState, pageState.nextSnapshotReason));
              pageState.nextSnapshotReason = 'heartbeat';
            }
          }
        },
      }),
      started: now,
      updated: now,
      lastActivity: now,
      engaged: 0,
      version: 0,
      nextSnapshotReason: 'initial',
    };
    // Arrival after server expiry must not overwrite more recent identify updates.
    delete pageState.event.user_properties;
    const isEnqueued = pageState.heartbeat.enqueue(this.snapshot(pageState, 'initial'));
    if (!isEnqueued) {
      // Do not turn subsequent activity on this page into repeated fallback views.
      this.skippedPage = true;
      this.config.loggerProvider.warn(
        'Page engagement: snapshot exceeds the Heartbeat size limit. Sending the original page view without engaged-time tracking.',
      );
      return false;
    }
    this.pageState = pageState;
    this.scheduleInactivity();
    void pageState.heartbeat.resetHeartbeat();
    return true;
  }

  private settle(pageState: PageState) {
    // Cap a late callback at the inactivity deadline; heartbeats never extend it.
    const now = Math.max(pageState.updated, Math.min(Date.now(), pageState.lastActivity + this.timeout));
    if (this.foreground) {
      pageState.engaged += Math.max(0, Math.min(now, pageState.lastActivity + this.activityWindow) - pageState.updated);
    }
    pageState.updated = now;
  }

  private snapshot(pageState: PageState, reason: string): Event {
    this.settle(pageState);
    const version = ++pageState.version;
    return {
      ...pageState.event,
      extra: { ...pageState.event.extra, pageEngagementSnapshot: true },
      event_properties: {
        ...pageState.event.event_properties,
        '[Amplitude] Engaged Time': pageState.engaged,
        '[Amplitude] Total Time': pageState.updated - pageState.started,
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
    if (this.pageState && Date.now() >= this.pageState.lastActivity + this.timeout) this.finish('inactivity');
    if (!this.pageState) {
      this.newPageView();
      return;
    }
    this.settle(this.pageState);
    this.pageState.lastActivity = Date.now();
    this.scheduleInactivity();
  };

  private resume = () => {
    if (this.scope.document.visibilityState !== 'visible') return;
    if (this.pageState) this.settle(this.pageState);
    this.foreground = true;
    this.activity();
  };

  private pause = () => {
    if (this.pageState) this.settle(this.pageState);
    this.foreground = false;
    if (this.pageState) {
      this.pageState.nextSnapshotReason = 'background';
      void this.pageState.heartbeat.heartbeat();
      this.client.flush();
    }
  };

  private retire(pageState: PageState, reason: string) {
    clearTimeout(this.inactivityTimer);
    const event = this.snapshot(pageState, reason);
    event.delay = { ...event.delay!, timeout: undefined };
    void pageState.heartbeat.update(event);
    pageState.heartbeat.pause();
    this.pageState = undefined;
  }

  finish(reason: string) {
    this.skippedPage = false;
    const pageState = this.pageState;
    if (!pageState) return;
    this.retire(pageState, reason);
    // Enqueue the final copy before clearing this page's heartbeat. Destination
    // coalesces pending snapshots and preserves in-flight ordering by delay ID.
    void pageState.heartbeat.heartbeat();
    // Request delivery before waiting for ingestion, especially during page exit.
    this.client.flush();
    pageState.heartbeat.stop();
  }

  setOptOut(optOut: boolean) {
    this.enabled = !optOut;
    if (optOut) {
      this.skippedPage = false;
      clearTimeout(this.inactivityTimer);
      this.pageState?.heartbeat.stop();
      this.pageState = undefined;
    }
  }

  teardown() {
    this.finish('teardown');
    this.enabled = false;
    this.removeListeners.forEach((remove) => remove());
  }
}
