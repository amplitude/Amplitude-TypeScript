import { test, expect, Page, Route } from '@playwright/test';
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
} from './helpers';

/**
 * E2E coverage for the GA'd SR performance knobs promoted to top-level
 * SessionReplayLocalConfig options in PR #1806. Defaults preserve current behavior:
 *   - eagerFullSnapshotSend (default true)
 *   - captureFullSnapshotOnFocus (default true)
 *   - maxSingleEventSizeBytes (default 9_000_000)
 *   - maxPersistedEventsSizeBytes (default 700_000)
 *
 * Each test asserts a behavior-visible difference between the knob's enabled and
 * disabled states through the full real-browser pipeline (Vite + worker + rrweb +
 * the mocked track API).
 */

function decodeEvents(rawBody: string): Array<Record<string, unknown>> {
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
  return bodies.flatMap(decodeEvents).filter((e) => e['type'] === EVENT_FULL_SNAPSHOT).length;
}

/** Mocks the track API and exposes the raw POST bodies received, in order. */
async function captureBodies(page: Page): Promise<{ getBodies: () => string[] }> {
  const rawBodies: string[] = [];
  await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
    rawBodies.push(readRouteBody(route));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
  });
  return { getBodies: () => rawBodies };
}

async function blurAndFlush(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
  await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
}

// ─── captureFullSnapshotOnFocus ───────────────────────────────────────────────
//
// A window `focus` event fired after recording is stable forces an extra
// takeFullSnapshot when the knob is enabled (the default). When disabled, the
// focusListener returns early and no additional full snapshot is produced. We
// count EVENT_FULL_SNAPSHOT (type 2) events in the decoded request bodies.

test.describe('captureFullSnapshotOnFocus', () => {
  test('default (true): a focus event after stable recording produces an additional full snapshot', async ({
    page,
  }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureBodies(page);

    // Listen before goto so the eager init send doesn't race past us.
    const requestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 10_000 });

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        captureFullSnapshotOnFocus: true,
      }),
    );
    await waitForReady(page);
    await requestPromise;
    // Let the initial recording fully stabilize so focus hits the takeFullSnapshot branch.
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Baseline: exactly one full snapshot from init.
    await blurAndFlush(page);
    expect(countFullSnapshots(getBodies())).toBe(1);

    // Focus → extra full snapshot.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await blurAndFlush(page);

    expect(countFullSnapshots(getBodies())).toBe(2);
  });

  test('false: a focus event after stable recording produces no additional full snapshot', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureBodies(page);

    const requestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 10_000 });

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        captureFullSnapshotOnFocus: false,
      }),
    );
    await waitForReady(page);
    await requestPromise;
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    await blurAndFlush(page);
    expect(countFullSnapshots(getBodies())).toBe(1);

    // Focus is a no-op for the full-snapshot path when the knob is off.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
    await blurAndFlush(page);

    expect(countFullSnapshots(getBodies())).toBe(1);
  });
});

// ─── eagerFullSnapshotSend ────────────────────────────────────────────────────
//
// With the knob enabled (default), the initial full snapshot is sent to the track
// API immediately on capture — without any blur/flush. With it disabled, the eager
// send is suppressed: no request goes out on a quiet page until an explicit
// blur+flush drains the buffer (the snapshot is still buffered, just not sent eagerly).

test.describe('eagerFullSnapshotSend', () => {
  test('default (true): the initial full snapshot is sent promptly without an explicit flush', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureBodies(page);

    const requestPromise = page.waitForRequest('https://api-sr.amplitude.com/**', { timeout: 10_000 });

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        eagerFullSnapshotSend: true,
      }),
    );
    await waitForReady(page);

    // The eager send fires the request — no blur/flush issued by the test.
    await requestPromise;
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect(getBodies().length).toBeGreaterThan(0);
    expect(countFullSnapshots(getBodies())).toBeGreaterThanOrEqual(1);
  });

  test('false: no request is sent on a quiet page until an explicit flush', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureBodies(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        eagerFullSnapshotSend: false,
      }),
    );
    await waitForReady(page);
    // Quiet window: no DOM interaction, so no interval-driven split fires. With eager
    // send suppressed and the onFullSnapshotProcessed callback undefined, nothing should
    // POST during this window.
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 5);

    expect(getBodies().length).toBe(0);

    // The snapshot is still buffered — an explicit flush drains it and delivers the snapshot.
    await blurAndFlush(page);

    expect(getBodies().length).toBeGreaterThan(0);
    expect(countFullSnapshots(getBodies())).toBeGreaterThanOrEqual(1);
  });
});

// ─── maxSingleEventSizeBytes ──────────────────────────────────────────────────
//
// Mirrors size-limits.spec.ts but drives the threshold via the new config knob
// instead of the hard-coded MAX_SINGLE_EVENT_SIZE constant. A full snapshot sized
// between the lowered cap and the SDK default is dropped at capture time when the
// knob lowers the cap, but delivered normally under the default.

test.describe('maxSingleEventSizeBytes', () => {
  // 1 MB cap: well above the 1 KB config floor, well below the 9 MB default.
  const CONFIGURED_CAP = 1_000_000;
  // ~2 MB attribute → the next full snapshot serializes to > 1 MB but << 9 MB, so it
  // crosses the configured cap while staying under the default.
  const MID_ATTR_LENGTH = 2_000_000;

  async function injectMidNode(page: Page): Promise<void> {
    await page.evaluate((len) => {
      const div = document.createElement('div');
      div.setAttribute('data-mid', 'x'.repeat(len));
      document.body.appendChild(div);
    }, MID_ATTR_LENGTH);
  }

  /** Mocks the track API, collecting (sessionId → events) per request. */
  async function captureBySession(page: Page) {
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

  test('lowered cap drops a full snapshot that exceeds the configured threshold', async ({ page }) => {
    const NEW_SESSION_ID = TEST_SESSION_ID + 60_000;
    await mockRemoteConfig(page, remoteConfigRecording);
    const getCalls = await captureBySession(page);

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        maxSingleEventSizeBytes: CONFIGURED_CAP,
      }),
    );
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Grow the DOM, then rotate sessions so rrweb takes a fresh (now-oversized) snapshot.
    await injectMidNode(page);
    await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (id) => (window as any).sessionReplay.setSessionId(id).promise as Promise<void>,
      NEW_SESSION_ID,
    );
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 6);

    const newSessionEvents = getCalls()
      .filter((c) => c.sessionId === String(NEW_SESSION_ID))
      .flatMap((c) => c.events);

    // The oversized full snapshot was dropped by the capture-time guard at the configured cap.
    expect(newSessionEvents.find((e) => e['type'] === EVENT_FULL_SNAPSHOT)).toBeUndefined();
    // Every event that did reach the wire is under the configured cap.
    for (const event of newSessionEvents) {
      expect(new Blob([JSON.stringify(event)]).size).toBeLessThanOrEqual(CONFIGURED_CAP);
    }
    // Control: the original (small) session delivered its full snapshot normally.
    const originalEvents = getCalls()
      .filter((c) => c.sessionId === String(TEST_SESSION_ID))
      .flatMap((c) => c.events);
    expect(originalEvents.find((e) => e['type'] === EVENT_FULL_SNAPSHOT)).toBeDefined();
  });

  test('default cap delivers the same mid-sized snapshot (knob is the discriminator)', async ({ page }) => {
    const NEW_SESSION_ID = TEST_SESSION_ID + 60_000;
    await mockRemoteConfig(page, remoteConfigRecording);
    const getCalls = await captureBySession(page);

    // No maxSingleEventSizeBytes param → SDK default (9 MB).
    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    await injectMidNode(page);
    await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (id) => (window as any).sessionReplay.setSessionId(id).promise as Promise<void>,
      NEW_SESSION_ID,
    );
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 6);

    const newSessionEvents = getCalls()
      .filter((c) => c.sessionId === String(NEW_SESSION_ID))
      .flatMap((c) => c.events);

    // Under the default cap the same ~2 MB snapshot is delivered, proving the drop above
    // was caused by the lowered knob and not the injection itself.
    expect(newSessionEvents.find((e) => e['type'] === EVENT_FULL_SNAPSHOT)).toBeDefined();
  });
});
