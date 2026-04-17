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

// 9.1 M chars: just over MAX_SINGLE_EVENT_SIZE = 9 * 1_000_000.
// Passed as a number to page.evaluate so only the integer crosses CDP;
// the browser generates the large string entirely in-process.
const OVERSIZED_ATTR_LENGTH = 9_100_000;

/**
 * Appends a <div data-large="xxx..."> whose single attribute value is
 * OVERSIZED_ATTR_LENGTH chars. When rrweb serialises the next full snapshot,
 * the resulting JSON string will exceed MAX_SINGLE_EVENT_SIZE and should be
 * dropped by the capture-time guard in EventCompressor.
 */
async function injectLargeNode(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate((len) => {
    const div = document.createElement('div');
    div.setAttribute('data-large', 'x'.repeat(len));
    document.body.appendChild(div);
  }, OVERSIZED_ATTR_LENGTH);
}

function decodeEvents(rawBody: string): Array<Record<string, unknown>> {
  if (!rawBody) return [];
  try {
    const payload = JSON.parse(rawBody) as { events?: unknown[] };
    if (!Array.isArray(payload.events)) return [];
    return payload.events.flatMap((s) => {
      if (typeof s !== 'string') return [];
      try {
        return [JSON.parse(s) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/** Mocks the track API, collecting (sessionId → events) pairs per request. */
async function captureBySession(page: import('@playwright/test').Page) {
  const calls: { sessionId: string; events: Array<Record<string, unknown>> }[] = [];
  await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
    const url = new URL(route.request().url());
    calls.push({
      sessionId: url.searchParams.get('session_id') ?? '',
      events: decodeEvents(readRouteBody(route)),
    });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
  });
  return () => calls;
}

// ─── Oversized single event — capture-time guard ──────────────────────────────

test.describe('oversized single event — capture-time guard', () => {
  test('oversized snapshot is not delivered to the track API', async ({ page }) => {
    const NEW_SESSION_ID = TEST_SESSION_ID + 60_000;
    await mockRemoteConfig(page, remoteConfigRecording);
    const getCalls = await captureBySession(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Inject a node whose attribute forces the next full snapshot to exceed 9 MB.
    await injectLargeNode(page);

    // setSessionId flushes the old session and immediately starts recording the new
    // one. rrweb takes a full snapshot of the now-large DOM synchronously during
    // record(); the capture-time guard in EventCompressor must drop it.
    await page.evaluate(
      (id) => (window as any).sessionReplay.setSessionId(id).promise as Promise<void>,
      NEW_SESSION_ID,
    );
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 6);

    // Every event that reached the server for the NEW session must be under the cap.
    // If the guard failed, we'd see a JSON string > 9 M chars here.
    const newSessionEvents = getCalls()
      .filter((c) => c.sessionId === String(NEW_SESSION_ID))
      .flatMap((c) => c.events);

    for (const event of newSessionEvents) {
      expect(JSON.stringify(event).length).toBeLessThan(9_000_000);
    }

    // The ORIGINAL session must have delivered a full snapshot, confirming that
    // normal recording was working before the oversized DOM was injected.
    const originalSessionEvents = getCalls()
      .filter((c) => c.sessionId === String(TEST_SESSION_ID))
      .flatMap((c) => c.events);
    expect(originalSessionEvents.find((e) => e['type'] === 2)).toBeDefined();
  });

  test('SDK records normally after an oversized snapshot is dropped', async ({ page }) => {
    const OVERSIZED_SESSION_ID = TEST_SESSION_ID + 60_000;
    const RECOVERY_SESSION_ID = TEST_SESSION_ID + 120_000;
    await mockRemoteConfig(page, remoteConfigRecording);
    const getCalls = await captureBySession(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Session 2: snapshot will be dropped (DOM is too large)
    await injectLargeNode(page);
    await page.evaluate(
      (id) => (window as any).sessionReplay.setSessionId(id).promise as Promise<void>,
      OVERSIZED_SESSION_ID,
    );
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 2);

    // Remove the large node so session 3 takes a normal-sized snapshot
    await page.evaluate(() => document.querySelector('[data-large]')?.remove());
    await page.evaluate(
      (id) => (window as any).sessionReplay.setSessionId(id).promise as Promise<void>,
      RECOVERY_SESSION_ID,
    );
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 6);

    // Session 3 must have delivered a full snapshot — SDK must still be operational
    const recoveryEvents = getCalls()
      .filter((c) => c.sessionId === String(RECOVERY_SESSION_ID))
      .flatMap((c) => c.events);
    expect(recoveryEvents.find((e) => e['type'] === 2)).toBeDefined();
  });
});

// ─── WAF 413 bisect-retry ─────────────────────────────────────────────────────

test.describe('WAF 413 bisect-retry', () => {
  test('splits batch on WAF 413 and delivers events via retry', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);

    let callCount = 0;
    const deliveredBodies: string[] = [];

    await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
      callCount++;
      if (callCount === 1) {
        // WAF 413 signature: JSON body containing "Payload exceeds"
        await route.fulfill({
          status: 413,
          contentType: 'application/json',
          body: '{"error":"Payload exceeds the maximum allowed size of 10MB"}',
        });
      } else {
        deliveredBodies.push(readRouteBody(route));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
      }
    });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 6);

    // SDK must have bisected and retried after the WAF 413
    expect(callCount).toBeGreaterThan(1);
    // Events must ultimately have been delivered
    expect(deliveredBodies.flatMap(decodeEvents).length).toBeGreaterThan(0);
  });

  test('app-layer 413 does not cause an infinite retry loop', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);

    let callCount = 0;
    await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
      callCount++;
      // App-layer 413: plain text, no WAF body signature
      await route.fulfill({ status: 413, contentType: 'text/plain', body: 'Payload Too Large' });
    });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    // Wait long enough for an infinite loop to be detectable
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 10);

    // Bisect bottoms out at single events; total calls must be bounded (O(n) not infinite)
    expect(callCount).toBeLessThan(20);
  });
});
