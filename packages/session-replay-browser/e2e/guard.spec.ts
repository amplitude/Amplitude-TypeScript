import { test, expect, Route } from '@playwright/test';
import {
  SR_API_SUCCESS,
  TEST_SESSION_ID,
  SNAPSHOT_SETTLE_MS,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  readRouteBody,
} from './helpers';

const EVENT_FULL_SNAPSHOT = 2;

function decodeAllEvents(rawBody: string): Array<Record<string, unknown>> {
  if (!rawBody) return [];
  let payload: { events?: unknown[] };
  try {
    payload = JSON.parse(rawBody) as { events?: unknown[] };
  } catch {
    return [];
  }
  if (!Array.isArray(payload.events)) return [];
  const results: Array<Record<string, unknown>> = [];
  for (const eventStr of payload.events) {
    if (typeof eventStr !== 'string') continue;
    try {
      results.push(JSON.parse(eventStr) as Record<string, unknown>);
    } catch {
      // skip unparseable events
    }
  }
  return results;
}

function countFullSnapshots(bodies: string[]): number {
  return bodies.flatMap((b) => decodeAllEvents(b)).filter((e) => e['type'] === EVENT_FULL_SNAPSHOT).length;
}

// ─── recordEventsInFlight guard ───────────────────────────────────────────────

test.describe('recordEventsInFlight guard (SR-3531)', () => {
  /**
   * Baseline: a normal page load produces exactly one FullSnapshot.
   * This verifies that the guard doesn't suppress the initial recording.
   */
  test('normal init produces exactly one FullSnapshot', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);

    const rawBodies: string[] = [];
    await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
      rawBodies.push(readRouteBody(route));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
    });

    // Register waitForRequest before goto so the immediate full-snapshot flush
    // (fired as soon as rrweb captures the snapshot) doesn't race past the listener.
    const requestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 10_000 });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);

    await requestPromise;
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const count = countFullSnapshots(rawBodies);
    expect(count).toBe(1);
  });

  /**
   * Focus event during async init is deferred and produces at least one additional snapshot
   * (no concurrent rrweb init race). The test dispatches a synthetic focus while init's
   * async chain is in-flight. The in-flight guard stores it as a pending call. After
   * init's recordEvents() completes, the pending call replays sequentially, producing a
   * second FullSnapshot. In CI headless Chromium, native browser focus events may also fire
   * on page load alongside the synthetic one; the guard serialises all of them, so the
   * count is >= 2 (never 1, which would mean the pending call was silently dropped).
   */
  test('focus event during async init is deferred — guard serialises it, never drops it', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);

    const rawBodies: string[] = [];
    await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
      rawBodies.push(readRouteBody(route));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
    });

    const requestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 10_000 });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));

    // Dispatch a synthetic focus before waitForReady to race with the async init chain.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    await waitForReady(page);
    await requestPromise;
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 2);

    // The guard must produce at least 2 FullSnapshots: init's + the deferred focus replay.
    // (Native browser focus events in CI may add more, but never fewer than 2.)
    const count = countFullSnapshots(rawBodies);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  /**
   * Known limitation (follow-up PR): a focus event fired AFTER recording is
   * fully stable causes focusListener to call recordEvents(false), which stops
   * and restarts rrweb — producing a second FullSnapshot. The guard does NOT
   * suppress this because the first recordEvents() has already completed by the
   * time focus fires. This test documents the current behavior so regressions are
   * visible; it should be updated when the focusListener is made smarter.
   */
  test('focus event after stable recording produces a second FullSnapshot (known limitation)', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);

    const rawBodies: string[] = [];
    await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
      rawBodies.push(readRouteBody(route));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
    });

    const requestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 10_000 });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await requestPromise;
    // Let the initial recording fully stabilize
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Now fire focus — recording is idle so the guard allows a new recordEvents() through
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Two FullSnapshots: one from init, one from the focus-triggered restart
    const count = countFullSnapshots(rawBodies);
    expect(count).toBe(2);
  });
});
