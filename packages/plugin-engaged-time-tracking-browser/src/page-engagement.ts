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
const BACKGROUND_SEND_INTERVAL = 1_000;

interface PageState {
  event: Event;
  heartbeat: Heartbeat;
  pulseTimer?: ReturnType<typeof setInterval>;
  started: number;
  updated: number;
  lastActivity: number;
  engaged: number;
  version: number;
  nextSnapshotReason: 'initial' | 'heartbeat' | 'background';
  lastBackgroundSent?: number;
  backgroundTimer?: ReturnType<typeof setTimeout>;
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
      `Page engagement: invalid duration ${value} ms; using default ${defaultValue} ms. Expected 0 < finite duration <= ${maximum} ms.`,
    );
    return defaultValue;
  }
  return value;
}

/** Owns one page-view delay group at a time, independently of the video heartbeat.
 * Keep per-owner state in a closure so ES5 bundles can minify internal names.
 */
export const createPageEngagement = (
  client: BrowserClient,
  scope: NonNullable<ReturnType<typeof getGlobalScope>>,
  options: EngagedTimeOptions,
  config: BrowserConfig,
  newPageView: () => void,
) => {
  let currentPage: PageState | undefined;
  let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
  let foreground = isForeground();
  let enabled = true;
  let skippedPage = false;
  const removeListeners: (() => void)[] = [];
  const timeout = resolveDurationMillis(
    options.inactivityTimeoutMillis,
    DEFAULT_INACTIVITY_TIMEOUT,
    config.loggerProvider,
    MAX_INACTIVITY_TIMEOUT_MILLIS,
  );
  const activityWindow = resolveDurationMillis(
    options.activityWindowMillis,
    DEFAULT_ACTIVITY_WINDOW,
    config.loggerProvider,
  );
  const pulse = Math.min(
    resolveDurationMillis(options.heartbeatIntervalMillis, DEFAULT_ENGAGEMENT_HEARTBEAT, config.loggerProvider),
    timeout / 2,
  );

  function isForeground() {
    return scope.document.visibilityState === 'visible' && scope.document.hasFocus();
  }

  function start(event: Event): Event | undefined {
    finish('navigation');
    if (!enabled) return undefined;
    const now = Date.now();
    foreground = isForeground();
    const pageState: PageState = {
      event: {
        ...event,
        // Capture top-level properties; snapshots add timing without mutating this object.
        event_properties: { ...event.event_properties },
        insert_id: event.insert_id || UUID(),
        time: event.time ?? now,
        // Share the SDK inactivity duration with the service fallback. The SDK counts
        // from last activity; the service counts from the last accepted heartbeat.
        delay: { id: UUID(), timeout },
      },
      heartbeat: new Heartbeat(client, pulse, timeout, config.loggerProvider, {
        // This owner settles elapsed time and finalizes before sending.
        // Avoid a second set of lifecycle sends.
        sendOnPageLifecycle: false,
        beforeHeartbeat: () => {
          // A heartbeat scheduled by the previous page must not update the new page state.
          if (currentPage === pageState) {
            if (Date.now() >= pageState.lastActivity + timeout) {
              retire(pageState, 'inactivity');
            } else {
              void pageState.heartbeat.update(snapshot(pageState, pageState.nextSnapshotReason));
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
      nextSnapshotReason: 'heartbeat',
    };
    // Arrival after server expiry must not overwrite more recent identify updates.
    delete pageState.event.user_properties;
    const initial = snapshot(pageState, 'initial');
    let isEnqueued = false;
    try {
      isEnqueued = pageState.heartbeat.enqueue(initial);
    } catch {
      // Heartbeat's size check serializes the event and can reject invalid source data.
      pageState.heartbeat.stop();
    }
    if (!isEnqueued) {
      // Do not turn subsequent activity on this page into repeated fallback views.
      skippedPage = true;
      config.loggerProvider.warn(
        'Page engagement: snapshot cannot be queued (invalid data or size limit); sending without engaged-time tracking.',
      );
      return undefined;
    }
    currentPage = pageState;
    scheduleInactivity();
    // The original pipeline sends initial. Start only the periodic pulse here;
    // Heartbeat.resetHeartbeat() would send a duplicate initial copy.
    pageState.pulseTimer = setInterval(() => void pageState.heartbeat.heartbeat(), pulse);
    return initial;
  }

  function settle(pageState: PageState) {
    // Cap a late callback at the inactivity deadline; heartbeats never extend it.
    const now = Math.max(pageState.updated, Math.min(Date.now(), pageState.lastActivity + timeout));
    if (foreground) {
      pageState.engaged += Math.max(0, Math.min(now, pageState.lastActivity + activityWindow) - pageState.updated);
    }
    pageState.updated = now;
  }

  function snapshot(pageState: PageState, reason: string): Event {
    settle(pageState);
    const version = ++pageState.version;
    return {
      ...pageState.event,
      ...(reason === 'initial' ? {} : { extra: { ...pageState.event.extra, engagedTimeReplay: true } }),
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

  function scheduleInactivity() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => finish('inactivity'), timeout);
  }

  const activity = () => {
    if (
      !enabled ||
      skippedPage ||
      !foreground ||
      (scope.document as Document & { prerendering?: boolean }).prerendering
    )
      return;
    if (currentPage && Date.now() >= currentPage.lastActivity + timeout) finish('inactivity');
    if (!currentPage) {
      newPageView();
      return;
    }
    settle(currentPage);
    currentPage.lastActivity = Date.now();
    scheduleInactivity();
  };

  const resume = () => {
    if (scope.document.visibilityState !== 'visible') return;
    if (currentPage) settle(currentPage);
    foreground = true;
    activity();
  };

  const pause = () => {
    if (currentPage) settle(currentPage);
    foreground = false;
    if (currentPage) {
      sendBackground(currentPage);
    }
  };

  function sendBackground(pageState: PageState) {
    const remaining =
      pageState.lastBackgroundSent === undefined
        ? 0
        : pageState.lastBackgroundSent + BACKGROUND_SEND_INTERVAL - Date.now();
    if (remaining > 0) {
      // blur and hidden can describe the same transition. Keep a single trailing
      // send at the original deadline, using the latest state when it fires.
      if (pageState.backgroundTimer === undefined) {
        pageState.backgroundTimer = setTimeout(() => {
          pageState.backgroundTimer = undefined;
          sendBackground(pageState);
        }, remaining);
      }
      return;
    }
    clearTimeout(pageState.backgroundTimer);
    pageState.backgroundTimer = undefined;
    pageState.lastBackgroundSent = Date.now();
    pageState.nextSnapshotReason = 'background';
    void pageState.heartbeat.heartbeat();
    client.flush();
  }

  function retire(pageState: PageState, reason: string) {
    clearInterval(pageState.pulseTimer);
    clearTimeout(pageState.backgroundTimer);
    clearTimeout(inactivityTimer);
    const event = snapshot(pageState, reason);
    event.delay = { ...event.delay!, timeout: undefined };
    void pageState.heartbeat.update(event);
    pageState.heartbeat.pause();
    currentPage = undefined;
  }

  function finish(reason: string) {
    skippedPage = false;
    const pageState = currentPage;
    if (!pageState) return;
    retire(pageState, reason);
    // Enqueue the final copy before clearing this page's heartbeat. Destination
    // coalesces pending snapshots and preserves in-flight ordering by delay ID.
    // Session/identity hooks run before Browser config updates. Defer delivery
    // until that update completes to avoid reentering session creation from track().
    void Promise.resolve().then(() => {
      void pageState.heartbeat.heartbeat();
      // flush() drains the timeline before flushing destination queues.
      client.flush();
      pageState.heartbeat.stop();
    });
  }

  function setOptOut(optOut: boolean) {
    enabled = !optOut;
    if (optOut) {
      skippedPage = false;
      clearTimeout(inactivityTimer);
      clearTimeout(currentPage?.backgroundTimer);
      clearInterval(currentPage?.pulseTimer);
      currentPage?.heartbeat.stop();
      currentPage = undefined;
    }
  }

  function teardown() {
    finish('teardown');
    enabled = false;
    removeListeners.forEach((remove) => remove());
  }

  const listen = (target: EventTarget, type: string, listener: EventListener) => {
    target.addEventListener(type, listener, { passive: true });
    removeListeners.push(() => target.removeEventListener(type, listener));
  };
  ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel'].forEach((type) => {
    listen(scope.document, type, activity);
  });
  listen(scope, 'focus', resume);
  listen(scope, 'blur', pause);
  listen(scope.document, 'visibilitychange', () => (isForeground() ? resume() : pause()));
  // Leaving the document always ends this view, including entry into BFCache.
  listen(scope, 'pagehide', () => finish('pagehide'));
  listen(scope, 'pageshow', () => {
    // A restored page starts a fresh view through the existing activity path.
    if (isForeground()) resume();
  });

  return { start, finish, setOptOut, teardown };
};

export type PageEngagement = ReturnType<typeof createPageEngagement>;
