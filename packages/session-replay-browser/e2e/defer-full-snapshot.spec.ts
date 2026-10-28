/**
 * E2E coverage for `deferFullSnapshot` — holding the initial rrweb full snapshot (and the
 * rrweb-record import) until the page has loaded.
 *
 * Two layers:
 *   1. Behavior: the snapshot lands before/after the window `load` event depending on the knob,
 *      `maxWaitMs` caps the wait, and stop()/setSessionId() during the deferral behave sanely.
 *   2. Page-load impact (chromium only, CPU-throttled): a heavy-DOM page is loaded with and
 *      without deferral, and main-thread blocking before `load` is compared. The per-run
 *      numbers are printed as a table and attached to the report so the improvement is visible,
 *      not just asserted.
 *
 * The harness page is `test-server/session-replay-browser/sr-page-load-perf.html`. It holds
 * the `load` event open with a slow subresource (intercepted and delayed by the test) so that
 * "before load" and "after load" are far enough apart to be unambiguous.
 *
 * Run manually (see e2e/README.md):
 *   npx playwright test --project=chromium packages/session-replay-browser/e2e/defer-full-snapshot.spec.ts
 */

import { test, expect, Page, Browser, BrowserContext } from '@playwright/test';
import {
  SR_API_SUCCESS,
  TEST_SESSION_ID,
  SNAPSHOT_SETTLE_MS,
  EVENT_FULL_SNAPSHOT,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  readRouteBody,
  flushRecording,
} from './helpers';

const PAGE_PATH = '/session-replay-browser/sr-page-load-perf.html';
const TRACK_URL = 'https://api-sr.amplitude.com/**';
const SLOW_RESOURCE_URL = 'https://slow-resource.test/pixel.png';
const EVENT_CUSTOM = 5;
// Wall clock (rrweb event timestamps) vs. performance.timeOrigin can disagree by a few ms.
const CLOCK_TOLERANCE_MS = 50;
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

type RRWebEvent = { type: number; timestamp: number; data?: Record<string, unknown> };

interface PerfMetrics {
  timeOrigin: number;
  loadEventStart: number;
  loadEventEnd: number;
  domContentLoaded: number;
  lcp: number;
  domBuildMs: number;
  initStartedAt: number;
  initResolvedAt: number;
  longTasksBeforeLoad: number;
  blockingBeforeLoadMs: number;
  longestTaskBeforeLoadMs: number;
  longTasksTotal: number;
  blockingTotalMs: number;
  longTaskObserverError?: string;
}

function decodeEvents(rawBodies: string[]): RRWebEvent[] {
  const events: RRWebEvent[] = [];
  for (const body of rawBodies) {
    if (!body) continue;
    let payload: { events?: unknown[] };
    try {
      payload = JSON.parse(body) as { events?: unknown[] };
    } catch {
      continue;
    }
    for (const eventStr of payload.events ?? []) {
      if (typeof eventStr !== 'string') continue;
      try {
        events.push(JSON.parse(eventStr) as RRWebEvent);
      } catch {
        // skip unparseable events
      }
    }
  }
  return events;
}

function fullSnapshots(events: RRWebEvent[]): RRWebEvent[] {
  return events.filter((e) => e.type === EVENT_FULL_SNAPSHOT);
}

function debugInfoPayloads(events: RRWebEvent[]): Array<Record<string, unknown>> {
  return events
    .filter((e) => e.type === EVENT_CUSTOM && e.data?.['tag'] === 'debug-info')
    .map((e) => (e.data?.['payload'] ?? {}) as Record<string, unknown>);
}

/** Mocks the track API and records raw bodies + the session_id query param per request. */
async function captureTrack(page: Page) {
  const bodies: string[] = [];
  const sessionIds: string[] = [];
  await page.route(TRACK_URL, async (route) => {
    sessionIds.push(new URL(route.request().url()).searchParams.get('session_id') ?? '');
    bodies.push(readRouteBody(route));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
  });
  return { bodies, sessionIds };
}

/** Delays the page's slow subresource so the window `load` event fires ~delayMs after request. */
async function holdLoadEvent(page: Page, delayMs: number): Promise<void> {
  await page.route(SLOW_RESOURCE_URL, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({ status: 200, contentType: 'image/png', body: TINY_PNG });
  });
}

async function readMetrics(page: Page): Promise<PerfMetrics> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  return page.evaluate(() => (window as any).getPerfMetrics() as PerfMetrics);
}

/** Epoch-ms timestamp of the window `load` event, comparable with rrweb event timestamps. */
function loadEpochMs(metrics: PerfMetrics): number {
  return metrics.timeOrigin + metrics.loadEventStart;
}

async function gotoHarness(page: Page, params: Record<string, string | number | boolean>): Promise<void> {
  await page.goto(buildUrl(PAGE_PATH, { sessionId: TEST_SESSION_ID, slowResource: SLOW_RESOURCE_URL, ...params }), {
    waitUntil: 'domcontentloaded',
  });
  await waitForReady(page);
}

// ─── Behavior ────────────────────────────────────────────────────────────────

test.describe('deferFullSnapshot: behavior', () => {
  test('default (no deferral): the initial full snapshot is taken before the load event', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await holdLoadEvent(page, 1500);
    const { bodies } = await captureTrack(page);

    await gotoHarness(page, { eagerFullSnapshotSend: true });
    await page.waitForLoadState('load');
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const events = decodeEvents(bodies);
    const metrics = await readMetrics(page);
    const snapshots = fullSnapshots(events);
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    expect(snapshots[0].timestamp).toBeLessThan(loadEpochMs(metrics) - CLOCK_TOLERANCE_MS);
    // No deferral outcome is reported when the knob is off.
    for (const payload of debugInfoPayloads(events)) {
      expect(payload['deferredStart']).toBeUndefined();
    }
  });

  test('enabled: nothing is recorded before load; the snapshot is taken after load and still delivered', async ({
    page,
  }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await holdLoadEvent(page, 2000);
    const { bodies } = await captureTrack(page);

    // Eager send makes delivery timing observable: a snapshot taken before load would POST
    // before load. With deferral the first request must not appear until load has fired.
    await gotoHarness(page, { deferFullSnapshot: true, deferUntil: 'load', eagerFullSnapshotSend: true });
    // SDK is initialized but load is still ~1.5s away: nothing may have been captured.
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 2);
    expect(bodies.length).toBe(0);

    await page.waitForLoadState('load');
    await page.waitForRequest(TRACK_URL, { timeout: 10_000 });
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const events = decodeEvents(bodies);
    const metrics = await readMetrics(page);
    const snapshots = fullSnapshots(events);
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].timestamp).toBeGreaterThanOrEqual(loadEpochMs(metrics) - CLOCK_TOLERANCE_MS);

    const deferred = debugInfoPayloads(events)
      .map((p) => p['deferredStart'] as { resolvedBy?: string; waitedMs?: number } | undefined)
      .find((d) => d !== undefined);
    expect(deferred?.resolvedBy).toBe('load');
    expect(deferred?.waitedMs).toBeGreaterThan(0);
  });

  test("until: 'idle' (default) also lands after load", async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await holdLoadEvent(page, 1500);
    const { bodies } = await captureTrack(page);

    await gotoHarness(page, { deferFullSnapshot: true, eagerFullSnapshotSend: true });
    await page.waitForLoadState('load');
    await page.waitForRequest(TRACK_URL, { timeout: 10_000 });
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const events = decodeEvents(bodies);
    const metrics = await readMetrics(page);
    const snapshots = fullSnapshots(events);
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].timestamp).toBeGreaterThanOrEqual(loadEpochMs(metrics) - CLOCK_TOLERANCE_MS);
    const resolvedBy = debugInfoPayloads(events)
      .map((p) => (p['deferredStart'] as { resolvedBy?: string } | undefined)?.resolvedBy)
      .find((r) => r !== undefined);
    // Chromium has requestIdleCallback; WebKit falls back to a post-load macrotask. Both report 'idle'.
    expect(resolvedBy).toBe('idle');
  });

  test('maxWaitMs caps the deferral when load is very slow', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await holdLoadEvent(page, 6000);
    const { bodies } = await captureTrack(page);

    await gotoHarness(page, {
      deferFullSnapshot: true,
      deferUntil: 'load',
      deferMaxWaitMs: 1000,
      eagerFullSnapshotSend: true,
    });
    // The first POST arrives well before the 6s load, released by the 1s cap.
    await page.waitForRequest(TRACK_URL, { timeout: 4000 });
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    const events = decodeEvents(bodies);
    const snapshots = fullSnapshots(events);
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    const deferred = debugInfoPayloads(events)
      .map((p) => p['deferredStart'] as { resolvedBy?: string; waitedMs?: number } | undefined)
      .find((d) => d !== undefined);
    expect(deferred?.resolvedBy).toBe('max-wait');
    expect(deferred?.waitedMs).toBeGreaterThanOrEqual(1000);
    expect(deferred?.waitedMs).toBeLessThan(3000);

    // Sanity: load really had not fired when the snapshot was taken.
    await page.waitForLoadState('load');
    const metrics = await readMetrics(page);
    expect(snapshots[0].timestamp).toBeLessThan(loadEpochMs(metrics));
  });

  test('stop() during the deferral prevents recording from ever starting', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    await holdLoadEvent(page, 1500);
    const { bodies } = await captureTrack(page);

    await gotoHarness(page, { deferFullSnapshot: true, deferUntil: 'load', eagerFullSnapshotSend: true });
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
      (window as any).sessionReplay.stop();
    });

    await page.waitForLoadState('load');
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 3);
    await flushRecording(page);

    expect(fullSnapshots(decodeEvents(bodies)).length).toBe(0);
  });

  test('setSessionId() during the deferral yields one snapshot, tagged with the new session', async ({ page }) => {
    const NEW_SESSION_ID = TEST_SESSION_ID + 70_000;
    await mockRemoteConfig(page, remoteConfigRecording);
    await holdLoadEvent(page, 1500);
    const { bodies, sessionIds } = await captureTrack(page);

    await gotoHarness(page, { deferFullSnapshot: true, deferUntil: 'load', eagerFullSnapshotSend: true });
    await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (id) => (window as any).sessionReplay.setSessionId(id).promise as Promise<void>,
      NEW_SESSION_ID,
    );

    await page.waitForLoadState('load');
    await page.waitForRequest(TRACK_URL, { timeout: 10_000 });
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await flushRecording(page);

    expect(fullSnapshots(decodeEvents(bodies)).length).toBe(1);
    expect(sessionIds.length).toBeGreaterThan(0);
    for (const sessionId of sessionIds) {
      expect(sessionId).toBe(String(NEW_SESSION_ID));
    }
  });
});

// ─── Page-load impact ────────────────────────────────────────────────────────
//
// Loads a ~30k-node page under 4x CPU throttling in three configurations and compares
// main-thread blocking (sum of long-task time over 50ms) between navigation start and the
// `load` event:
//   - no-sdk:   the page alone (its own style/layout of the big DOM is itself a long task)
//   - baseline: SDK with default settings — rrweb import + full snapshot run *before* load
//   - deferred: SDK with deferFullSnapshot — that work moves past load
// SDK-attributable pre-load blocking is (config − no-sdk). The synthetic DOM build is
// excluded from every config by the harness.

type PerfConfig = 'no-sdk' | 'baseline' | 'deferred';

interface ScenarioResult {
  config: PerfConfig;
  metrics: PerfMetrics;
  /** Full-snapshot timestamp relative to the load event (negative = before load); null for no-sdk. */
  snapshotOffsetFromLoadMs: number | null;
}

const PERF_ROWS = 6000; // ~30k DOM nodes
const PERF_LOAD_HOLD_MS = 4000;
const PERF_CPU_THROTTLE = 4;
const PERF_RUNS = 3;

async function runScenario(browser: Browser, browserName: string, config: PerfConfig): Promise<ScenarioResult> {
  const context: BrowserContext = await browser.newContext();
  const page = await context.newPage();
  try {
    await mockRemoteConfig(page, remoteConfigRecording);
    await holdLoadEvent(page, PERF_LOAD_HOLD_MS);
    const { bodies } = await captureTrack(page);
    if (browserName === 'chromium') {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: PERF_CPU_THROTTLE });
    }

    const firstRequest = config === 'no-sdk' ? null : page.waitForRequest(TRACK_URL, { timeout: 30_000 });
    await gotoHarness(page, {
      nodes: PERF_ROWS,
      ...(config === 'no-sdk' ? { skipSdk: true } : { eagerFullSnapshotSend: true }),
      ...(config === 'deferred' ? { deferFullSnapshot: true } : {}),
    });
    await page.waitForLoadState('load');
    if (firstRequest) {
      await firstRequest;
    }
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const metrics = await readMetrics(page);
    expect(metrics.longTaskObserverError, 'longtask PerformanceObserver must be available').toBeUndefined();
    if (config === 'no-sdk') {
      return { config, metrics, snapshotOffsetFromLoadMs: null };
    }
    const snapshot = fullSnapshots(decodeEvents(bodies))[0];
    expect(snapshot, `${config}: expected a full snapshot to be delivered`).toBeDefined();
    return { config, metrics, snapshotOffsetFromLoadMs: Math.round(snapshot.timestamp - loadEpochMs(metrics)) };
  } finally {
    await context.close();
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function formatTable(results: ScenarioResult[], controlBlockingMs: number): string {
  const header = [
    'config',
    'run',
    'blockingBeforeLoadMs',
    'sdkBlockingBeforeLoadMs',
    'longTasksBeforeLoad',
    'longestTaskBeforeLoadMs',
    'blockingTotalMs',
    'snapshotVsLoadMs',
    'loadEventStartMs',
    'lcpMs',
  ];
  const rows = results.map((r, i) => [
    r.config,
    String((i % PERF_RUNS) + 1),
    r.metrics.blockingBeforeLoadMs.toFixed(0),
    r.config === 'no-sdk' ? '(control)' : (r.metrics.blockingBeforeLoadMs - controlBlockingMs).toFixed(0),
    String(r.metrics.longTasksBeforeLoad),
    r.metrics.longestTaskBeforeLoadMs.toFixed(0),
    r.metrics.blockingTotalMs.toFixed(0),
    r.snapshotOffsetFromLoadMs === null
      ? 'n/a'
      : (r.snapshotOffsetFromLoadMs >= 0 ? '+' : '') + String(r.snapshotOffsetFromLoadMs),
    r.metrics.loadEventStart.toFixed(0),
    r.metrics.lcp.toFixed(0),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells: string[]) => '| ' + cells.map((c, i) => c.padEnd(widths[i])).join(' | ') + ' |';
  return [line(header), '|' + widths.map((w) => '-'.repeat(w + 2)).join('|') + '|', ...rows.map(line)].join('\n');
}

test.describe('deferFullSnapshot: page-load impact', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(300_000);

  test('deferring the snapshot removes SDK main-thread blocking from the pre-load window', async ({
    browser,
    browserName,
  }, testInfo) => {
    test.skip(browserName !== 'chromium', 'Needs the longtask PerformanceObserver and CDP CPU throttling.');

    // Warm-up: primes Vite's transform/dep-optimizer cache so the first measured run is not
    // penalized by cold module compilation.
    await runScenario(browser, browserName, 'baseline');

    const results: ScenarioResult[] = [];
    // Interleave configs so drift on the shared runner affects all of them equally.
    for (let i = 0; i < PERF_RUNS; i++) {
      results.push(await runScenario(browser, browserName, 'no-sdk'));
      results.push(await runScenario(browser, browserName, 'baseline'));
      results.push(await runScenario(browser, browserName, 'deferred'));
    }
    const byConfig = (config: PerfConfig) => results.filter((r) => r.config === config);
    const control = byConfig('no-sdk');
    const baseline = byConfig('baseline');
    const deferred = byConfig('deferred');

    const controlBlockingMs = median(control.map((r) => r.metrics.blockingBeforeLoadMs));
    const summarize = (runs: ScenarioResult[]) => {
      const blockingBeforeLoadMs = median(runs.map((r) => r.metrics.blockingBeforeLoadMs));
      return {
        medianBlockingBeforeLoadMs: blockingBeforeLoadMs,
        medianSdkBlockingBeforeLoadMs: blockingBeforeLoadMs - controlBlockingMs,
        medianLongTasksBeforeLoad: median(runs.map((r) => r.metrics.longTasksBeforeLoad)),
        medianLongestTaskBeforeLoadMs: median(runs.map((r) => r.metrics.longestTaskBeforeLoadMs)),
        medianBlockingTotalMs: median(runs.map((r) => r.metrics.blockingTotalMs)),
        medianSnapshotVsLoadMs: median(
          runs.map((r) => r.snapshotOffsetFromLoadMs).filter((v): v is number => v !== null),
        ),
      };
    };
    const summary = {
      rows: PERF_ROWS,
      approxNodes: PERF_ROWS * 5,
      cpuThrottle: PERF_CPU_THROTTLE,
      runs: PERF_RUNS,
      control: { medianBlockingBeforeLoadMs: controlBlockingMs },
      baseline: summarize(baseline),
      deferred: summarize(deferred),
    };

    const table = formatTable([...control, ...baseline, ...deferred], controlBlockingMs);
    // eslint-disable-next-line no-console
    console.log(
      `\n[deferFullSnapshot page-load impact] ${PERF_ROWS} rows (~${
        PERF_ROWS * 5
      } nodes), ${PERF_CPU_THROTTLE}x CPU throttle, ${PERF_RUNS} runs each\n` +
        `${table}\n` +
        `median SDK-attributable pre-load blocking: baseline ${summary.baseline.medianSdkBlockingBeforeLoadMs.toFixed(
          0,
        )}ms → deferred ${summary.deferred.medianSdkBlockingBeforeLoadMs.toFixed(0)}ms\n` +
        `median full snapshot vs load: baseline ${summary.baseline.medianSnapshotVsLoadMs.toFixed(
          0,
        )}ms → deferred +${summary.deferred.medianSnapshotVsLoadMs.toFixed(0)}ms\n`,
    );
    await testInfo.attach('defer-full-snapshot-page-load-impact.json', {
      body: JSON.stringify({ summary, results }, null, 2),
      contentType: 'application/json',
    });
    await testInfo.attach('defer-full-snapshot-page-load-impact.md', { body: table, contentType: 'text/markdown' });

    // Harness sanity: every baseline run snapshots before load, every deferred run after.
    for (const r of baseline) {
      expect(r.snapshotOffsetFromLoadMs, 'baseline snapshot before load').toBeLessThan(0);
    }
    for (const r of deferred) {
      expect(r.snapshotOffsetFromLoadMs, 'deferred snapshot after load').toBeGreaterThanOrEqual(-CLOCK_TOLERANCE_MS);
    }
    // Baseline pays for rrweb import + snapshot before load as a meaningful amount of blocking...
    expect(summary.baseline.medianSdkBlockingBeforeLoadMs).toBeGreaterThan(100);
    // ...and deferral removes at least half of that SDK-attributable pre-load blocking.
    expect(summary.deferred.medianSdkBlockingBeforeLoadMs).toBeLessThan(
      summary.baseline.medianSdkBlockingBeforeLoadMs * 0.5,
    );
    // The work is moved, not skipped: the deferred config still delivers a full snapshot (asserted
    // in runScenario) and its blocking now shows up *after* load.
    expect(summary.deferred.medianBlockingTotalMs).toBeGreaterThan(summary.deferred.medianBlockingBeforeLoadMs);
  });
});
