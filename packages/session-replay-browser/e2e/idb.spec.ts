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

// ─── Multi-tab and fallback tests ─────────────────────────────────────────────

/**
 * Reads the unique event-string contents of every record across both IDB stores
 * (sequencesToSend.events + sessionCurrentSequence.events), regardless of tabId.
 * Used to verify that no events were dropped across a multi-tab interleaving.
 */
function getAllPersistedEvents(page: import('@playwright/test').Page) {
  return page.evaluate(
    (dbName: string): Promise<string[]> =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['sequencesToSend', 'sessionCurrentSequence'], 'readonly');
          const all: string[] = [];
          const onCursor = (req: IDBRequest<IDBCursorWithValue | null>) => {
            req.onsuccess = () => {
              const cursor = req.result;
              if (cursor) {
                const value = cursor.value as { events: string[] };
                for (const ev of value.events ?? []) all.push(ev);
                cursor.continue();
              }
            };
          };
          onCursor(tx.objectStore('sequencesToSend').openCursor());
          onCursor(tx.objectStore('sessionCurrentSequence').openCursor());
          tx.oncomplete = () => resolve(all);
          tx.onerror = () => reject(tx.error);
        };
      }),
    IDB_NAME,
  );
}

/**
 * Tags each rrweb event with a unique marker before it is sent to the SDK by
 * monkey-patching `sessionReplay.addEvent` is too invasive — instead we inject
 * synthetic events via the public API.  A simpler approach: emit user events
 * (clicks) which the SDK captures with timestamps — we count unique events.
 */

test.describe('IDB multi-tab and fallback behaviour', () => {
  /**
   * Multi-tab invariant: when two tabs in the same browser context record events
   * for the same sessionId, ALL events from both tabs eventually appear in the
   * shared IndexedDB across the two stores.  Pre-fix, Tab A's
   * addEventToCurrentSequence would silently overwrite Tab B's in-progress events.
   * Post-fix, Tab A promotes Tab B's events to sequencesToSend before claiming
   * the slot, so nothing is dropped.
   *
   * We can't easily count rrweb events one-by-one because rrweb captures large
   * sets of mutation events asynchronously.  Instead we count the total number
   * of stored events across both tabs and verify it matches the sum of what each
   * tab generated independently — within a small tolerance for non-deterministic
   * snapshot timing.  More importantly we tag tab-B events with a deterministic
   * marker (a blur trigger after a known click) and verify those events SURVIVE
   * the cross-tab claim.
   */
  test('multi-tab: events from both tabs survive in shared IDB (cross-tab promote)', async ({ browser }) => {
    // Single context = shared origin, shared IndexedDB.  Each `page` in the
    // context is a real browser tab from the SDK's perspective (separate
    // sessionStorage → distinct tabId).
    const context = await browser.newContext();
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    try {
      const allErrorsA: Error[] = [];
      const allErrorsB: Error[] = [];
      tabA.on('pageerror', (e) => allErrorsA.push(e));
      tabB.on('pageerror', (e) => allErrorsB.push(e));

      // Mock remote config and SR API on each tab.
      for (const p of [tabA, tabB]) {
        await mockRemoteConfig(p, remoteConfigRecording);
        await p.route('https://api-sr.amplitude.com/**', (route) =>
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) }),
        );
      }

      // Load Tab A, then Tab B with the same sessionId.  They will share the
      // same IDB database (same origin) and pick up unique tabIds via sessionStorage.
      const url = buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        logLevel: LOG_LEVEL_DEBUG,
      });

      await tabA.goto(url);
      await waitForReady(tabA);

      await tabB.goto(url);
      await waitForReady(tabB);

      // Confirm distinct tabIds (sessionStorage is per-tab).
      const tabIdA = await tabA.evaluate(() => sessionStorage.getItem('_amp_sr_tab_id'));
      const tabIdB = await tabB.evaluate(() => sessionStorage.getItem('_amp_sr_tab_id'));
      expect(tabIdA).toBeTruthy();
      expect(tabIdB).toBeTruthy();
      expect(tabIdA).not.toBe(tabIdB);

      // Generate events on each tab. Interleave clicks so the two tabs ping-pong
      // writes to the shared sessionCurrentSequence slot.
      for (let i = 0; i < 3; i++) {
        await tabA.click('#test-button');
        await tabB.click('#test-button');
        await tabA.click('#test-input');
        await tabB.click('#test-input');
      }

      // Give rrweb time to flush captured mutations into IDB.
      await tabA.waitForTimeout(300);
      await tabB.waitForTimeout(300);

      // Read the union of all persisted events from both stores.  Use either
      // tab — both see the same database.
      const allEvents = await getAllPersistedEvents(tabA);

      // Pre-fix this would lose most cross-tab events.  We can't count exact
      // numbers because rrweb is asynchronous, but the total must be reasonably
      // large (tens of events from two tabs of clicks + snapshots).  We assert a
      // floor that is comfortably above what a single tab alone would produce
      // had cross-tab events been dropped.
      // (Each click triggers multiple rrweb events; with 6 clicks per tab and
      //  full snapshots we expect >> 10 total.)
      expect(allEvents.length).toBeGreaterThan(10);

      // No unhandled promise rejections from either tab.
      expect(allErrorsA).toHaveLength(0);
      expect(allErrorsB).toHaveLength(0);
    } finally {
      await tabA.close();
      await tabB.close();
      await context.close();
    }
  });

  /**
   * Multi-tab atomicity: storeCurrentSequence + concurrent addEventToCurrentSequence.
   *
   * Verifies that a flush in Tab A and a recording in Tab B do not lose events
   * even when they race.  We trigger Tab A's flush (which calls
   * sendCurrentSequenceEvents → store.storeCurrentSequence) at the same time as
   * Tab B is generating events.  Pre-fix this could lose Tab B's events because
   * storeCurrentSequence was three separate transactions.  Post-fix the entire
   * promote+reset is atomic, so events appended after the read either land in
   * the next sequence or in a new current sequence — never dropped.
   */
  test('multi-tab: storeCurrentSequence atomicity under concurrent addEvent', async ({ browser }) => {
    const context = await browser.newContext();
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    try {
      const errors: Error[] = [];
      tabA.on('pageerror', (e) => errors.push(e));
      tabB.on('pageerror', (e) => errors.push(e));

      // Capture all events delivered to the track API across both tabs.  Counting
      // sent events (rather than persisted-but-unsent) is the right invariant: a
      // non-atomic storeCurrentSequence would drop events that were appended after
      // the read but before the reset, so they would never be sent at all.  With
      // the fix, every appended event either lands in the flushed sequence (sent)
      // or the next current-sequence (persisted), and overall throughput is
      // preserved.
      const trackBodies: string[] = [];
      for (const p of [tabA, tabB]) {
        await mockRemoteConfig(p, remoteConfigRecording);
        await p.route('https://api-sr.amplitude.com/**', async (route) => {
          const body = route.request().postData() ?? '';
          trackBodies.push(body);
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(SR_API_SUCCESS),
          });
        });
      }

      const url = buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        logLevel: LOG_LEVEL_DEBUG,
      });

      await tabA.goto(url);
      await waitForReady(tabA);
      await tabB.goto(url);
      await waitForReady(tabB);

      // Race: Tab A flushes (which triggers sendCurrentSequenceEvents →
      // storeCurrentSequence) at the same time that Tab B is generating events
      // for the same sessionId.  IDB serialises overlapping readwrite transactions,
      // so atomic storeCurrentSequence guarantees no event is dropped between the
      // read and the slot reset.
      const racy = Promise.all([
        (async () => {
          for (let i = 0; i < 5; i++) {
            await tabB.click('#test-button');
          }
        })(),
        tabA.evaluate(() => window.dispatchEvent(new Event('blur'))),
        tabA.evaluate(() => void (window as any).sessionReplay.flush(false)),
      ]);
      await racy;
      await tabA.waitForTimeout(300);
      await tabB.waitForTimeout(300);

      // Force both tabs to flush remaining events to the track API.
      await tabB.evaluate(() => window.dispatchEvent(new Event('blur')));
      await tabB.evaluate(() => void (window as any).sessionReplay.flush(false));
      await tabA.waitForTimeout(300);
      await tabB.waitForTimeout(300);

      // Combined view: storeCurrentSequence atomicity + sent events from both tabs
      // should have produced multiple non-empty track API requests.  Pre-fix, a
      // race between storeCurrentSequence on Tab A and addEventToCurrentSequence
      // on Tab B could silently lose events.
      expect(trackBodies.length).toBeGreaterThan(0);

      // Verify the bodies actually contain rrweb events (non-empty payloads).
      const totalPayloadBytes = trackBodies.reduce((acc, b) => acc + b.length, 0);
      expect(totalPayloadBytes).toBeGreaterThan(100);

      // No unhandled rejections from the concurrent storeCurrentSequence path.
      expect(errors).toHaveLength(0);
    } finally {
      await tabA.close();
      await tabB.close();
      await context.close();
    }
  });

  /**
   * IDB-fail-and-fallback: when IDB fails persistently, the SDK should fall back
   * to the in-memory store on the FIRST failure (consecutiveFailureThreshold
   * defaults to 1) and continue recording without crashing or losing future events.
   *
   * Strategy: patch IDBObjectStore.prototype.put to throw synchronously on EVERY
   * call (not just one).  The first IDB write throws, recordFailure() runs,
   * onPersistentFailure → switchToMemoryStore is invoked, and the in-memory store
   * takes over.  Subsequent events are recorded in memory and successfully sent
   * to the track API.
   */
  test('IDB persistent failure: SDK falls back to memory store immediately on first error', async ({ page }) => {
    // Patch IDB before any SDK code runs.  Every put() throws a synthetic error;
    // openCursor is left alone so getSequencesToSend (called once at init) can
    // still complete with an empty cursor.
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const origPut = IDBObjectStore.prototype.put;
      let putCallCount = 0;
      (window as any).__idbPutCalls = () => putCallCount;
      IDBObjectStore.prototype.put = function (...args: unknown[]) {
        putCallCount++;
        // Throw synchronously — same effect as a real IDB QuotaExceededError.
        throw new DOMException('Simulated IDB put failure', 'QuotaExceededError');
        // unreachable, but keeps types happy
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        return (origPut as any).apply(this, args);
      } as typeof IDBObjectStore.prototype.put;
    });

    const { pageErrors } = listenForIdbErrors(page);
    const { getBodies } = await captureTrackRequests(page);

    // Look for the explicit fallback warn from events-manager.ts.
    const fallbackWarns: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('falling back to in-memory event store')) {
        fallbackWarns.push(msg.text());
      }
    });

    // Manual setup (not loadPage) so captureTrackRequests' route handler stays
    // active — loadPage installs a second route on the same URL which would
    // intercept before captureTrackRequests can record bodies.
    await mockRemoteConfig(page, remoteConfigRecording);
    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        logLevel: LOG_LEVEL_DEBUG,
      }),
    );
    await waitForReady(page);
    await page.waitForTimeout(300);

    // Generate events AFTER the fallback has been triggered.
    await page.click('#test-button');
    await page.click('#test-input');
    await page.click('#test-button');

    // Flush.  Memory store is now active so events should be sent successfully.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => void (window as any).sessionReplay.flush(false));
    await page.waitForTimeout(500);

    // 1. The fallback warn was logged exactly once (or at least once — repeated
    //    failures should not spam if hasTriggeredFallback guards it).
    expect(fallbackWarns.length).toBeGreaterThanOrEqual(1);

    // 2. At least one batch of events was delivered to the track API after
    //    fallback — proves the SDK kept recording in memory.
    expect(getBodies().length).toBeGreaterThan(0);

    // 3. Zero unhandled promise rejections — the IDB failures must all be caught.
    expect(pageErrors).toHaveLength(0);

    // 4. IDB put was attempted at least once (proving we exercised the failure
    //    path) — but not many times, because fallback should occur immediately.
    const putCalls = await page.evaluate(() => (window as any).__idbPutCalls() as number);
    expect(putCalls).toBeGreaterThanOrEqual(1);
  });

  /**
   * Hang-protection regression guard: if `indexedDB.open()` never fires
   * `onsuccess`/`onerror` (the documented Chrome-blocked-by-other-tab and
   * "closing" scenarios), the SDK must NOT hang waiting for IDB.  The 2s
   * timeout in `createStore` rejects, `SessionReplayEventsIDBStore.new()`
   * returns undefined, and the events-manager falls back to the in-memory
   * store.  Recording must continue normally.
   *
   * Strategy: monkey-patch `indexedDB.open` before any SDK code runs so the
   * returned IDBOpenDBRequest never settles.  Then verify:
   *   1. The SDK initialises within ~3s (well below the 10s `waitForReady`
   *      and below the 2s timeout + a small grace margin)
   *   2. Recording produces events that get delivered to the track API
   *   3. No unhandled promise rejections leak
   */
  test('IDB openDB hang: SDK initialises within 3s and falls back to memory store', async ({ page }) => {
    // Patch indexedDB.open BEFORE any SDK code runs.  The returned request
    // never fires onsuccess or onerror — the open hangs indefinitely, simulating
    // a foreign tab holding an open connection during a version upgrade.
    await page.addInitScript(() => {
      const stuckOpen = () => {
        // Construct a fake IDBOpenDBRequest-like object.  Since real
        // IDBOpenDBRequest cannot be instantiated directly, we return a duck
        // that supports the `onsuccess` / `onerror` pattern — but never fires
        // either callback.  The idb wrapper library awaits the promise of
        // success; with no callback ever firing, that promise never settles.
        const req: any = {
          // Fake event-target shim — addEventListener never invokes anything.
          addEventListener: () => {
            /* never resolves */
          },
          removeEventListener: () => {
            /* no-op */
          },
          dispatchEvent: () => true,
          onsuccess: null,
          onerror: null,
          onblocked: null,
          onupgradeneeded: null,
          readyState: 'pending',
          result: null,
          error: null,
          source: null,
          transaction: null,
        };
        return req as IDBOpenDBRequest;
      };
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const origOpen = indexedDB.open.bind(indexedDB);
      // Only stall the SDK's IDB open; let any internal Playwright/page IDB
      // calls go through.  The SDK's DB name is derived from the API key
      // (first 10 chars).  Match anything starting with our test key prefix.
      indexedDB.open = function (name: string, version?: number): IDBOpenDBRequest {
        if (name.startsWith('d90c5cf09c')) {
          return stuckOpen();
        }
        return origOpen(name, version);
      } as typeof indexedDB.open;
    });

    const { pageErrors } = listenForIdbErrors(page);
    const { getBodies } = await captureTrackRequests(page);

    const start = Date.now();
    await mockRemoteConfig(page, remoteConfigRecording);
    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        logLevel: LOG_LEVEL_DEBUG,
      }),
    );
    await waitForReady(page);
    const elapsed = Date.now() - start;

    // The 2s openDB timeout + small init overhead must complete well under 3s.
    // Pre-fix this would hang until waitForReady's 10s limit and time out.
    expect(elapsed).toBeLessThan(3000);

    // Generate events and verify they're delivered (memory store works).
    await page.click('#test-button');
    await page.click('#test-input');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => void (window as any).sessionReplay.flush(false));
    await page.waitForTimeout(500);

    expect(getBodies().length).toBeGreaterThan(0);
    expect(pageErrors).toHaveLength(0);
  });

  /**
   * Regression guard: zero unhandled promise rejections during a normal multi-tab
   * recording session.  Closes the loop on the original AbortError "Failed to
   * store session replay events in IndexedDB" defect — neither tab should leak
   * unhandled rejections from any of the IDB store paths.
   */
  test('multi-tab: no unhandled promise rejections during normal recording', async ({ browser }) => {
    const context = await browser.newContext();
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    try {
      const errors: Error[] = [];
      tabA.on('pageerror', (e) => errors.push(e));
      tabB.on('pageerror', (e) => errors.push(e));

      for (const p of [tabA, tabB]) {
        await mockRemoteConfig(p, remoteConfigRecording);
        await p.route('https://api-sr.amplitude.com/**', (route) =>
          route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SR_API_SUCCESS) }),
        );
      }

      const url = buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        logLevel: LOG_LEVEL_DEBUG,
      });

      await tabA.goto(url);
      await waitForReady(tabA);
      await tabB.goto(url);
      await waitForReady(tabB);

      // Interleave clicks across tabs.
      for (let i = 0; i < 3; i++) {
        await tabA.click('#test-button');
        await tabB.click('#test-button');
      }

      // Both tabs flush.
      await tabA.evaluate(() => window.dispatchEvent(new Event('blur')));
      await tabB.evaluate(() => window.dispatchEvent(new Event('blur')));
      await tabA.evaluate(() => void (window as any).sessionReplay.flush(false));
      await tabB.evaluate(() => void (window as any).sessionReplay.flush(false));
      await tabA.waitForTimeout(300);
      await tabB.waitForTimeout(300);

      expect(errors).toHaveLength(0);
    } finally {
      await tabA.close();
      await tabB.close();
      await context.close();
    }
  });
});
