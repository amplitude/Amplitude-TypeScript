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
   * Guard test: dispatch a focus event immediately after page load (while the
   * async init chain — getRecordFunction / initializeNetworkObservers — is still
   * in flight). The focusListener calls recordEvents(false), which should be
   * dropped by the in-flight guard so that only one FullSnapshot is emitted.
   */
  test('focus event during async init does not produce a duplicate FullSnapshot', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);

    const rawBodies: string[] = [];
    await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
      rawBodies.push(readRouteBody(route));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
    });

    // Register the listener early so the immediate flush doesn't escape.
    const requestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 10_000 });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));

    // Fire focus immediately — before waitForReady — to race with the async init chain.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    await waitForReady(page);
    await requestPromise;
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Extra flush to capture any delayed events
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    const count = countFullSnapshots(rawBodies);
    expect(count).toBe(1);
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
