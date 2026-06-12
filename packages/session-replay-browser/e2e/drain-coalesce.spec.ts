import { test, expect, Page, Route } from '@playwright/test';
import {
  TEST_SESSION_ID,
  SNAPSHOT_SETTLE_MS,
  SR_API_SUCCESS,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  readRouteBody,
} from './helpers';

/**
 * E2E for the page-load backlog drain coalescing (SR-4660).
 *
 * Scenario: a prior page load left MULTIPLE same-identity sequences persisted in IndexedDB
 * (sequencesToSend) because their POSTs never completed. On the next page load the SDK replays
 * that backlog via `sendStoredEvents` → `markCoalesceNextFlush` → `mergeDrainBacklog`, which
 * collapses the N same-(session, device, api, type, ...) batches into far fewer POSTs (one,
 * here) — instead of the pre-fix flood of N separate requests.
 *
 * How the backlog is created without delivering it (load 1):
 *   - Mock the track API to HANG (never fulfill). A 200 (even a throttled 200) would clean the
 *     IDB record via onComplete; an abort/4xx/429 would exhaust retries and also clean it. Only
 *     a pending request leaves the persisted sequence intact in IDB across the reload.
 *   - Drive continuous DOM activity with three amp-unmask marker divs (marker-A/B/C). The
 *     time-based sequence split logic (MIN_INTERVAL=500ms, growing) promotes completed sequences
 *     into the sequencesToSend store; the hung POSTs never clean them up.
 *   - Assert as a precondition that >1 marker-bearing sequence is persisted (N), failing loudly
 *     if multi-sequence persistence couldn't be reproduced rather than weakening the assertion.
 *
 * The drain (load 2):
 *   - Same fixed TEST_SESSION_ID so the IDB store key matches and the backlog is read back.
 *   - Track API now records bodies and returns clean 200s.
 *   - Assert the drain produces exactly ONE marker-bearing POST (< N), that the single merged
 *     body contains marker-A, marker-B AND marker-C (coalesced, not dropped/reordered/split),
 *     and that the SR-4660 coalesce log fired (proving the drain path, not the throttle path).
 */

// DB name derived from the apiKey in sr-capture-test.html ('d90c5cf09ca2546a1626272906b99a76').
const IDB_NAME = 'd90c5cf09c_amp_session_replay_events';
const LOG_LEVEL_DEBUG = 4;

/**
 * Track-API mock with two phases controlled by `mode.hang`:
 *   hang=true  → never fulfill (request stays pending) so the sequence stays persisted in IDB.
 *   hang=false → record the (gunzipped) body and return a clean 200.
 * page.route persists across reloads; in-flight hung requests from load 1 are aborted by the
 * navigation, and load-2 requests take the recording path.
 */
async function mockTrackApiHangThenRecord(page: Page): Promise<{ getBodies: () => string[]; mode: { hang: boolean } }> {
  const bodies: string[] = [];
  const mode = { hang: true };
  await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
    if (mode.hang) {
      // Keep the request pending forever — the persisted sequence is never delivered and
      // therefore never cleaned from IDB, so it survives the reload.
      await new Promise<void>(() => {
        /* never resolves */
      });
      return;
    }
    bodies.push(readRouteBody(route));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) });
  });
  return { getBodies: () => bodies, mode };
}

/**
 * Continuously generates DOM mutations + pointer events for `durationMs`, embedding `marker`
 * in an amp-unmask div so the marker text survives SR's input-masking privacy filter and is
 * visible in the captured event stream. Mirrors the marker technique from throttle-merge.spec.ts.
 */
async function continuousActivity(page: Page, marker: string, durationMs: number): Promise<void> {
  await page.evaluate(
    ({ tag, ms }) => {
      const markerDiv = document.createElement('div');
      markerDiv.className = 'amp-unmask';
      markerDiv.textContent = tag;
      markerDiv.id = `marker-div-${tag}`;
      document.body.appendChild(markerDiv);

      return new Promise<void>((resolve) => {
        const start = Date.now();
        let i = 0;
        const tick = () => {
          if (Date.now() - start >= ms) return resolve();
          const input = document.getElementById('test-input') as HTMLInputElement | null;
          if (input) {
            input.value = `iter-${i++}`;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          document.getElementById('test-button')?.click();
          setTimeout(tick, 50);
        };
        tick();
      });
    },
    { tag: marker, ms: durationMs },
  );
}

/** Reads the events arrays of every record currently in the sequencesToSend IDB store. */
function getPersistedSequences(page: Page): Promise<string[][]> {
  return page.evaluate(
    (dbName: string): Promise<string[][]> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('sequencesToSend', 'readonly');
          const out: string[][] = [];
          const cursorReq = tx.objectStore('sequencesToSend').openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (cursor) {
              const value = cursor.value as { events?: string[] };
              out.push(value.events ?? []);
              cursor.continue();
            }
          };
          tx.oncomplete = () => resolve(out);
          tx.onerror = () => reject(tx.error);
        };
      }),
    IDB_NAME,
  );
}

const MARKERS = ['marker-A', 'marker-B', 'marker-C'];

test.describe('page-load drain coalescing (SR-4660)', () => {
  test('persisted backlog of same-identity sequences drains as one coalesced POST on reload', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getBodies, mode } = await mockTrackApiHangThenRecord(page);

    // Collect console logs so we can assert the SR-4660 drain coalesce log fired.
    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));

    // ── Load 1: build the persisted backlog (track API hangs, nothing is delivered) ──
    const url = buildUrl('/session-replay-browser/sr-capture-test.html', {
      sessionId: TEST_SESSION_ID,
      storeType: 'idb',
      logLevel: LOG_LEVEL_DEBUG,
    });
    await page.goto(url);
    await waitForReady(page);
    // Let rrweb capture its full snapshot and the metadata/debug events settle.
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 2);

    // Drive activity across several sequence-split intervals with three distinct markers, then a
    // trailing burst so the marker-C sequence is also split out of the (undrained) current slot.
    await continuousActivity(page, 'marker-A', 800);
    await continuousActivity(page, 'marker-B', 800);
    await continuousActivity(page, 'marker-C', 800);
    await continuousActivity(page, 'tail', 2500);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // Precondition: multiple same-identity sequences are persisted, and the markers we will look
    // for post-reload are actually among them. If this can't be reproduced, fail here loudly.
    const persisted = await getPersistedSequences(page);
    const persistedCount = persisted.length;
    const persistedText = persisted.map((events) => events.join('')).join('');
    expect(persistedCount, `expected >1 persisted sequence to prove coalescing; got ${persistedCount}`).toBeGreaterThan(
      1,
    );
    for (const marker of MARKERS) {
      expect(persistedText, `marker ${marker} should be persisted in sequencesToSend pre-reload`).toContain(marker);
    }

    // ── Load 2: reload with the same sessionId; track API now records and returns 200 ──
    mode.hang = false;
    await page.reload();
    await waitForReady(page);
    // The drain flush is scheduled at timeout 0; give it room to fire (no activity generated,
    // so no live sequence splits should compete for POSTs during this window).
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS * 3);

    // Only the drain POST(s) carry the markers — the reloaded DOM no longer contains the marker
    // divs, so fresh live-capture POSTs are marker-free.
    const bodies = getBodies();
    const markerBodies = bodies.filter((b) => MARKERS.some((m) => b.includes(m)));

    // Coalesced: N persisted sequences → exactly 1 merged POST (pre-fix this would be N POSTs).
    expect(
      markerBodies.length,
      `expected the ${persistedCount} persisted sequences to coalesce into 1 POST, got ${markerBodies.length}`,
    ).toBe(1);
    expect(markerBodies.length).toBeLessThan(persistedCount);

    // The single merged body must carry events from all three persisted sequences — proving the
    // backlog was coalesced, not dropped, reordered, or split per-marker.
    for (const marker of MARKERS) {
      expect(markerBodies[0]).toContain(marker);
    }

    // The drain-specific coalesce log fired (distinguishes the SR-4660 drain path from the
    // post-throttle merge path).
    expect(
      consoleLogs.some((l) => /coalesced \d+ persisted page-load backlog batches into 1 request/.test(l)),
      'expected the SR-4660 page-load backlog coalesce log to fire',
    ).toBe(true);
  });
});
