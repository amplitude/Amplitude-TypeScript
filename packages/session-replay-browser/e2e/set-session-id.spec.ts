import { test, expect } from '@playwright/test';
import {
  TEST_SESSION_ID,
  SNAPSHOT_SETTLE_MS,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  captureTrackRequests,
  flushRecording,
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

// ─── setSessionId no-op (SR2-3635) ───────────────────────────────────────────

test.describe('setSessionId no-op (SR2-3635)', () => {
  test('redundant setSessionId does not restart rrweb capture', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await flushRecording(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect(countFullSnapshots(getBodies())).toBe(1);

    // Poll-style redundant calls (hour-bucket pattern) must not stop/restart rrweb.
    await page.evaluate(async (sessionId) => {
      const sr = (window as any).sessionReplay;
      await sr.setSessionId(sessionId).promise;
      await sr.setSessionId(sessionId).promise;
      await sr.setSessionId(sessionId).promise;
    }, TEST_SESSION_ID);

    await page.click('#test-button');
    await flushRecording(page);

    expect(countFullSnapshots(getBodies())).toBe(1);
  });

  test('session id change still restarts recording', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies } = await captureTrackRequests(page);

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await flushRecording(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect(countFullSnapshots(getBodies())).toBe(1);

    const nextSessionId = TEST_SESSION_ID + 3_600_000;
    await page.evaluate(async (sessionId) => {
      await (window as any).sessionReplay.setSessionId(sessionId).promise;
    }, nextSessionId);

    await page.click('#test-button');
    await flushRecording(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    expect(countFullSnapshots(getBodies())).toBeGreaterThanOrEqual(2);
    const currentSessionId = await page.evaluate((): number | string | undefined => {
      return (
        window as { sessionReplay?: { getSessionId: () => number | string | undefined } }
      ).sessionReplay?.getSessionId();
    });
    expect(currentSessionId).toBe(nextSessionId);
  });
});
