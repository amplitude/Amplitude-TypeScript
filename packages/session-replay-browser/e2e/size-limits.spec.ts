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
import { MAX_EVENT_LIST_SIZE, MAX_SINGLE_EVENT_SIZE } from '../src/constants';

// Just over the byte cap so the next full snapshot is guaranteed oversized.
// Derived from the constant so the test stays in sync if the threshold is bumped.
// Passed as a number to page.evaluate so only the integer crosses CDP;
// the browser generates the large string entirely in-process.
const OVERSIZED_ATTR_LENGTH = MAX_SINGLE_EVENT_SIZE + 100_000;

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
      expect(new Blob([JSON.stringify(event)]).size).toBeLessThanOrEqual(MAX_SINGLE_EVENT_SIZE);
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

    // Non-WAF 413 short-circuits to completeRequest without bisecting, so the batch
    // produces at most one tracking call. Allow a small slack for an unrelated follow-up
    // flush during the wait, but flag a regression that re-enables bisect on app-layer 413s.
    expect(callCount).toBeLessThanOrEqual(2);
  });
});

// ─── Empty-batch leak (SR-4284) ───────────────────────────────────────────────

test.describe('empty batch leak (SR-4284)', () => {
  // A single rrweb event between MAX_EVENT_LIST_SIZE (2 MB) and MAX_SINGLE_EVENT_SIZE
  // (9 MB) passes the per-event capture-time guard but, when it lands in
  // addEventToCurrentSequence with an empty buffer, drives shouldSplitEventsList's
  // size-constraint branch true on a zero-event buffer. Pre-fix the split path
  // finalized that empty buffer into sequencesToSend, leaving an events:[] row that
  // older SDKs would later POST as an empty body (the root cause of the ~416/24h
  // "Empty request body" 400s on the uploader). Post-fix we expect no empty-body
  // POSTs and no empty rows to ever be persisted in IDB.

  // 2× the list cap: comfortably under the per-event cap. The rrweb full snapshot
  // serializing this attribute will be > 2 MB but << 9 MB, so it bypasses the
  // capture-time drop and exercises the SR-4284 store-layer path.
  const MID_SIZE_ATTR_LENGTH = MAX_EVENT_LIST_SIZE * 2;

  async function injectMidSizeNode(page: import('@playwright/test').Page): Promise<void> {
    await page.evaluate((len) => {
      const div = document.createElement('div');
      div.setAttribute('data-mid', 'x'.repeat(len));
      document.body.appendChild(div);
    }, MID_SIZE_ATTR_LENGTH);
  }

  test('mid-sized event into a drained slot fires the store-layer guard and posts no empty body', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);

    // Capture every POST body so we can assert no empty-body POST went to the wire.
    const rawBodies: string[] = [];
    await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
      rawBodies.push(readRouteBody(route));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
    });

    // Capture console.log output. The SR-4284 store-layer guards emit a sampled
    // (1-in-100, first hit deterministic) debug message whose presence proves the
    // guards actually fired — without this signal, the test would also pass when
    // only the upstream events-manager guard catches the empty (the older, weaker
    // protection). The SDK's logger routes debug() to console.log (see Logger),
    // so we capture 'log' type messages and filter for the [Debug] prefix.
    const debugMessages: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'log' && msg.text().includes('[Debug]')) debugMessages.push(msg.text());
    });

    // logLevel=4 (Debug) so the SDK's loggerProvider.debug calls reach the console.
    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        logLevel: 4,
      }),
    );
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Drain the current-sequence slot so it exists with events:[] (the precondition
    // for the SR-4284 root cause). blur → events-manager.sendCurrentSequenceEvents →
    // store.storeCurrentSequence → IDB current-sequence row reset to {events:[], tabId}.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Now mutate the DOM with a > 2 MB attribute. rrweb emits an incremental
    // mutation event that, serialized, exceeds MAX_EVENT_LIST_SIZE. It lands in
    // addEventToCurrentSequence on a slot that already exists with events:[] —
    // shouldSplitEventsList's size-constraint branch fires on a zero-event buffer.
    // Pre-fix this would have written events:[] into sequencesToSend; post-fix the
    // store-layer guard catches it and emits the SR-4284 sampled warn.
    await injectMidSizeNode(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 4);

    // Drain again so the held mid-size event (parked in the slot by the post-fix
    // "skip empty write, just claim slot" path) is promoted and sent. This is the
    // post-fix behaviour: events aren't lost, just deferred to the next drain.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 2);

    // Assertion 1: the SR-4284 store-layer addEventToCurrentSequence guard fired.
    // This is the strongest signal that the bug pathway was actually exercised AND
    // caught at the store layer — not just the events-manager fallback cleanup.
    expect(
      debugMessages.some((m) => m.includes('Filtered empty session replay sequence at addEventToCurrentSequence')),
    ).toBe(true);

    // Assertion 2: no POST body had an empty events array.
    expect(rawBodies.length).toBeGreaterThan(0);
    for (const body of rawBodies) {
      const events = decodeEvents(body);
      expect(events.length).toBeGreaterThan(0);
    }

    // Assertion 3: the mid-size event still reached the wire. Without the fix, the
    // empty row would have been written first and the real event held in the slot;
    // with the fix, the real event still gets delivered on the next flush.
    const allEvents = rawBodies.flatMap(decodeEvents);
    const hasMidSizeEvent = rawBodies.some((b) => b.length > MAX_EVENT_LIST_SIZE);
    expect(hasMidSizeEvent).toBe(true);
    expect(allEvents.length).toBeGreaterThan(0);
  });
});
