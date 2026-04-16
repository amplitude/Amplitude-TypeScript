/**
 * E2E tests for IndexedDB transaction abort handling.
 *
 * These tests repro the scenario described in the "indexed-db-transaction-aborted" branch:
 *   "Failed to store session replay events in IndexedDB: AbortError: The transaction was
 *    aborted, so the request cannot be fulfilled."
 *
 * Three root causes were fixed:
 *
 * 1. `addEventToCurrentSequence` — first-event path (`!sequenceEvents`): used to `return`
 *    immediately after `await tx.store.put(...)`, leaving `tx.done` rejection unhandled.
 *    Fix: attach `tx.done.catch(logIdbError)` before any await.
 *
 * 2. `getSequencesToSend` — inline transaction had no saved reference, so `tx.done` was
 *    never caught. An abort after cursor exhaustion produced an unhandled rejection.
 *    Fix: save `tx` and attach `tx.done.catch(logIdbError)` before any await.
 *
 * 3. `addEventToCurrentSequence` — split path: used to call `storeSendingEvents` in a
 *    separate transaction after the `sessionCurrentSequence` transaction, breaking
 *    atomicity. If the first transaction aborted, events could end up in both stores.
 *    Fix: use a single multi-store transaction (`splitTx`) covering both stores so both
 *    writes commit or roll back atomically.
 *
 * All AbortErrors are routed through `logIdbError`, which downgrades them from
 * `warn` → `debug` (transient browser-initiated aborts, not actionable).
 *
 * Technique: `page.addInitScript` patches `IDBObjectStore.prototype.put` and
 * `.openCursor` before the SDK loads. `window.__armIdbAbort(storeName)` arms a
 * one-shot abort on the next write/cursor-open for that store; `window.__idbAbortFired`
 * confirms it triggered.
 *
 * Log-level note: tests use `logLevel: 4` (Debug) so both `[Warn]` and `[Debug]`
 * messages are visible. Assertions check:
 *   - `[Warn]: Failed to store session replay events in IndexedDB` → must NOT appear
 *   - `[Debug]: Failed to store session replay events in IndexedDB` → must appear exactly once
 *   - `page.on('pageerror', …)` → must stay empty (the core unhandled-rejection guard)
 */

import { test, expect } from '@playwright/test';
import {
  mockRemoteConfig,
  buildUrl,
  waitForReady,
  remoteConfigRecording,
  captureTrackRequests,
  TEST_SESSION_ID,
  SR_API_SUCCESS,
} from './helpers';

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_FAILURE = 'Failed to store session replay events in IndexedDB';
const LOG_LEVEL_DEBUG = 4; // LogLevel.Debug — shows all messages including debug + warn
// DB name derived from apiKey in sr-capture-test.html: 'd90c5cf09ca2546a1626272906b99a76'
const IDB_NAME = 'd90c5cf09c_amp_session_replay_events';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Injects a one-shot IDB abort interceptor into the page before any scripts run.
 *
 * Arm via `window.__armIdbAbort(storeName)` — the next write (`put`) or cursor open
 * (`openCursor`) on that store will be allowed to complete, then the surrounding
 * transaction is immediately aborted. `window.__idbAbortFired` is set to `true`
 * once the abort fires.
 *
 * Patches only `IDBObjectStore.prototype.put` and `.openCursor`.
 */
function injectIdbAbortInterceptor(page: import('@playwright/test').Page) {
  return page.addInitScript(() => {
    let _store: string | null = null;
    (window as any).__armIdbAbort = (store: string) => {
      _store = store;
    };
    (window as any).__idbAbortFired = false;

    function patchRequest(req: IDBRequest, storeName: string, tx: IDBTransaction) {
      if (_store !== storeName) return;
      _store = null; // one-shot
      req.addEventListener(
        'success',
        () => {
          (window as any).__idbAbortFired = true;
          try {
            tx.abort();
          } catch {
            // already committed — ignore
          }
        },
        { once: true },
      );
    }

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const origPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (v, k) {
      const req = origPut.call(this, v, k);
      patchRequest(req, this.name, this.transaction);
      return req;
    };

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const origCursor = IDBObjectStore.prototype.openCursor;
    IDBObjectStore.prototype.openCursor = function (q, d) {
      const req = origCursor.call(this, q, d);
      patchRequest(req, this.name, this.transaction);
      return req;
    };
  });
}

/**
 * Sets up listeners for IDB-related errors and log messages.
 *
 * Returns live arrays that fill as the page runs:
 *   pageErrors — unhandled Promise rejections (the core regression guard; before the
 *                fix, AbortErrors from tx.done surfaced here)
 *   idbWarns   — console.warn lines containing STORAGE_FAILURE
 *   idbDebug   — console.log lines containing STORAGE_FAILURE (Amplitude logs debug
 *                via console.log at LogLevel.Debug)
 */
function listenForIdbErrors(page: import('@playwright/test').Page) {
  const pageErrors: Error[] = [];
  const idbWarns: string[] = [];
  const idbDebug: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err));
  page.on('console', (msg) => {
    if (!msg.text().includes(STORAGE_FAILURE)) return;
    if (msg.type() === 'warning') idbWarns.push(msg.text());
    if (msg.type() === 'log') idbDebug.push(msg.text());
  });
  return { pageErrors, idbWarns, idbDebug };
}

/**
 * Reads row counts from the two IDB object stores used by the session replay SDK.
 * Used to verify atomicity: a rolled-back split transaction must leave neither store
 * partially written.
 */
function getIdbStoreCounts(page: import('@playwright/test').Page) {
  return page.evaluate(
    (dbName: string): Promise<{ sequencesToSend: number; currentSequence: number }> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['sequencesToSend', 'sessionCurrentSequence'], 'readonly');
          const c1 = tx.objectStore('sequencesToSend').count();
          const c2 = tx.objectStore('sessionCurrentSequence').count();
          tx.oncomplete = () => resolve({ sequencesToSend: c1.result, currentSequence: c2.result });
          tx.onerror = () => reject(tx.error);
        };
      }),
    IDB_NAME,
  );
}

/** Navigate to the SR test page and wait for the SDK to be ready. */
async function loadPage(page: import('@playwright/test').Page, sessionId = TEST_SESSION_ID) {
  await mockRemoteConfig(page, remoteConfigRecording);
  await page.route('https://api-sr.amplitude.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) }),
  );
  await page.goto(
    buildUrl('/session-replay-browser/sr-capture-test.html', {
      sessionId,
      logLevel: LOG_LEVEL_DEBUG,
    }),
  );
  await waitForReady(page);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('IDB transaction abort handling', () => {
  /**
   * Repro: addEventToCurrentSequence — first-event path (no existing sequence).
   *
   * The first rrweb event for a session takes the `!sequenceEvents` branch:
   *   tx.store.get(sessionId)  → undefined
   *   tx.store.put(...)        → put succeeds
   *   [old code] return;       ← tx.done rejection was unhandled
   *   [new code] tx.done.catch(logIdbError) ← attached before any await → debug
   *
   * We arm the interceptor before page load so the abort fires on the very first
   * put to `sessionCurrentSequence` (the rrweb full snapshot).
   */
  test('addEventToCurrentSequence first-event path: AbortError logged at debug not warn', async ({ page }) => {
    await injectIdbAbortInterceptor(page);
    // Arm before navigation — catches the first IDB write (rrweb full snapshot)
    await page.addInitScript(() => {
      (window as any).__armIdbAbort('sessionCurrentSequence');
    });

    const { pageErrors, idbWarns, idbDebug } = listenForIdbErrors(page);
    await loadPage(page);
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => (window as any).__idbAbortFired as boolean)).toBe(true);
    // tx.done rejection must be handled — the core regression guard
    expect(pageErrors).toHaveLength(0);
    // Error must reach logIdbError → debug, not warn; exactly once (errorLogged flag)
    expect(idbWarns).toHaveLength(0);
    expect(idbDebug).toHaveLength(1);
  });

  /**
   * Repro: addEventToCurrentSequence — existing-events path (append, no split).
   *
   * After the first event is stored, subsequent events take the else branch:
   *   tx.store.get(sessionId)  → existing sequence
   *   tx.store.put(...)        → append + put succeeds, then tx aborts
   *
   * We arm the interceptor after page load (snapshot already stored) and trigger
   * a new event via a click, while staying within the 500 ms split interval so
   * the append (not split) path is taken.
   */
  test('addEventToCurrentSequence existing-events path: AbortError logged at debug not warn', async ({ page }) => {
    await injectIdbAbortInterceptor(page);
    const { pageErrors, idbWarns, idbDebug } = listenForIdbErrors(page);

    await loadPage(page);
    // Arm after load — snapshot already stored; next write is an append
    await page.evaluate(() => void (window as any).__armIdbAbort('sessionCurrentSequence'));
    await page.click('#test-button');
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => (window as any).__idbAbortFired as boolean)).toBe(true);
    expect(pageErrors).toHaveLength(0);
    expect(idbWarns).toHaveLength(0);
    expect(idbDebug).toHaveLength(1);
  });

  /**
   * Repro: addEventToCurrentSequence — split path (shouldSplitEventsList = true).
   *
   * After MIN_INTERVAL (500 ms) elapses, the next event triggers a time-based split.
   * The split uses a single multi-store transaction (`splitTx`) that writes to both
   * `sessionCurrentSequence` (reset) and `sequencesToSend` (new sequence).
   * We arm the abort on `sequencesToSend` to catch the split transaction.
   *
   * Fix: `splitTx.done.catch(logIdbError)` is attached before any await, so the
   * AbortError is always routed through logIdbError → debug level.
   */
  test('addEventToCurrentSequence split path: AbortError logged at debug not warn', async ({ page }) => {
    await injectIdbAbortInterceptor(page);
    const { pageErrors, idbWarns, idbDebug } = listenForIdbErrors(page);

    await loadPage(page);
    // Wait for the time-based split interval to elapse (MIN_INTERVAL = 500 ms)
    await page.waitForTimeout(600);

    // Arm abort on 'sequencesToSend' — the store the split transaction writes to last.
    // The next click will trigger shouldSplitEventsList = true (time-based), opening
    // splitTx; the interceptor aborts splitTx after the sequencesToSend put succeeds.
    await page.evaluate(() => void (window as any).__armIdbAbort('sequencesToSend'));
    await page.click('#test-button');
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => (window as any).__idbAbortFired as boolean)).toBe(true);
    expect(pageErrors).toHaveLength(0);
    expect(idbWarns).toHaveLength(0);
    expect(idbDebug).toHaveLength(1);
  });

  /**
   * Atomicity: split-path abort leaves no partial writes in IDB.
   *
   * When `splitTx` aborts, both the `sessionCurrentSequence` reset and the
   * `sequencesToSend` insert must roll back atomically:
   *   - sequencesToSend.count() === 0  (write rolled back — no orphaned sequence)
   *   - sessionCurrentSequence.count() === 1  (not cleared — events still present)
   *
   * If atomicity were broken (e.g. two separate transactions), `sequencesToSend`
   * would hold a partial write and the same events would be sent twice on the next
   * flush.
   */
  test('addEventToCurrentSequence split path: atomic abort leaves no partial writes', async ({ page }) => {
    await injectIdbAbortInterceptor(page);

    await loadPage(page);
    await page.waitForTimeout(600); // wait for MIN_INTERVAL to elapse

    await page.evaluate(() => void (window as any).__armIdbAbort('sequencesToSend'));
    await page.click('#test-button');
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => (window as any).__idbAbortFired as boolean)).toBe(true);

    const counts = await getIdbStoreCounts(page);
    expect(counts.sequencesToSend).toBe(0); // write rolled back — no orphaned sequence
    expect(counts.currentSequence).toBe(1); // not cleared — pre-split events still present
  });

  /**
   * Repro: getSequencesToSend — cursor abort mid-traversal.
   *
   * `getSequencesToSend` is called by `sendStoredEvents` during SDK initialisation.
   * It reads stored sequences via a cursor on `sequencesToSend`. An abort while the
   * cursor is open causes `tx.done` to reject with AbortError.
   *
   * Fix: save `tx` and attach `tx.done.catch(logIdbError)` before any await.
   *
   * Because `getSequencesToSend` is only triggered on page load, this test uses a
   * two-navigation approach:
   *   1. Load normally so IDB is populated.
   *   2. Arm via sessionStorage (persists across reloads).
   *   3. Reload — init() → sendStoredEvents → getSequencesToSend → cursor abort.
   */
  test('getSequencesToSend cursor abort: AbortError logged at debug not warn', async ({ page }) => {
    await injectIdbAbortInterceptor(page);
    // Second init script: arm the cursor abort on reload if the sessionStorage flag is set.
    // Runs after injectIdbAbortInterceptor so __armIdbAbort is already defined.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('__armCursorAbort') === '1') {
        sessionStorage.removeItem('__armCursorAbort');
        (window as any).__armIdbAbort('sequencesToSend');
      }
    });

    const { pageErrors, idbWarns, idbDebug } = listenForIdbErrors(page);

    // First load: SDK initialises and records normally (cursor abort not yet armed)
    await loadPage(page);

    // Arm for the next navigation via sessionStorage
    await page.evaluate(() => sessionStorage.setItem('__armCursorAbort', '1'));

    // Reload: init() → initialize(true) → sendStoredEvents → getSequencesToSend → abort
    await page.reload();
    await waitForReady(page);
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => (window as any).__idbAbortFired as boolean)).toBe(true);
    expect(pageErrors).toHaveLength(0);
    expect(idbWarns).toHaveLength(0);
    expect(idbDebug).toHaveLength(1);
  });

  /**
   * Resilience: the SDK continues recording after an IDB abort.
   *
   * An IDB transaction abort is transient — the SDK should recover and be able to
   * record and flush subsequent events. Verifies:
   *   1. Abort is handled gracefully (no crash, no unhandled rejection, no warn)
   *   2. After the abort, the SDK can still receive new events and flush them
   */
  test('SDK continues recording after IDB abort', async ({ page }) => {
    await injectIdbAbortInterceptor(page);
    // Arm before load → aborts the very first IDB write (rrweb full snapshot)
    await page.addInitScript(() => {
      (window as any).__armIdbAbort('sessionCurrentSequence');
    });

    const { pageErrors, idbWarns, idbDebug } = listenForIdbErrors(page);
    const { getBodies } = await captureTrackRequests(page);

    await mockRemoteConfig(page, remoteConfigRecording);
    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        logLevel: LOG_LEVEL_DEBUG,
      }),
    );
    await waitForReady(page);
    await page.waitForTimeout(200);

    // Generate new events after the abort
    await page.click('#test-button');
    await page.click('#test-input');

    // Flush and verify events are delivered
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => void (window as any).sessionReplay.flush(false));
    await page.waitForTimeout(500);

    // SDK should have recovered and sent at least one batch of events
    expect(getBodies().length).toBeGreaterThan(0);

    // Abort must be handled and logged at debug (not warn), exactly once
    expect(pageErrors).toHaveLength(0);
    expect(idbWarns).toHaveLength(0);
    expect(idbDebug).toHaveLength(1);
  });

  /**
   * Baseline: no IDB errors during normal operation.
   *
   * Sanity check that in a normal recording session (no forced aborts) there are
   * no IDB-related warnings, debug-level storage errors, or page errors at all.
   */
  test('normal recording: no IDB errors', async ({ page }) => {
    const { pageErrors, idbWarns, idbDebug } = listenForIdbErrors(page);

    await loadPage(page);
    await page.click('#test-button');
    await page.click('#test-input');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => void (window as any).sessionReplay.flush(false));
    await page.waitForTimeout(300);

    expect(pageErrors).toHaveLength(0);
    expect(idbWarns).toHaveLength(0);
    expect(idbDebug).toHaveLength(0);
  });
});
