/**
 * E2E tests for IndexedDB transaction abort handling.
 *
 * These tests repro the scenario described in the "indexed-db-transaction-aborted" branch:
 *   "Failed to store session replay events in IndexedDB: AbortError: The transaction was
 *    aborted, so the request cannot be fulfilled."
 *
 * Two root causes were fixed:
 *
 * 1. `addEventToCurrentSequence` — the `!sequenceEvents` (first-event) branch used to
 *    `return undefined` immediately after `await tx.store.put(...)`. If the transaction
 *    aborted after the put resolved but before auto-commit, `tx.done` rejected with an
 *    unhandled AbortError that bypassed `logIdbError` entirely.
 *    Fix: attach `tx.done.catch(logIdbError)` immediately after opening the transaction so
 *    any rejection is always handled, regardless of which code path returns first.
 *
 * 2. `getSequencesToSend` — the transaction was created inline without saving a reference,
 *    so `tx.done` was never caught. An abort after cursor exhaustion produced an unhandled
 *    rejection.
 *    Fix: save `tx` and attach `tx.done.catch(logIdbError)` before any await.
 *
 * Both fixes use a non-blocking `.catch()` handler (not `await tx.done`) with an
 * `errorLogged` flag to prevent double-logging if the outer `try/catch` also fires.
 * After both fixes all AbortErrors flow through `logIdbError`, which downgrades them from
 * `warn` → `debug` (transient browser-initiated aborts, not actionable).
 *
 * Technique: `page.addInitScript` patches `IDBObjectStore.prototype.put` and
 * `IDBObjectStore.prototype.openCursor` BEFORE the SDK loads. A window-level control
 * object (`window.__idbAbortCtrl`) lets individual tests arm an abort for a specific
 * operation, then assert it fired.
 *
 * Log-level note: tests use `logLevel: 4` (Debug) so both `[Warn]` and `[Debug]` messages
 * are visible. The assertion is:
 *   - `[Warn]: Failed to store session replay events in IndexedDB` → must NOT appear
 *   - `[Debug]: Failed to store session replay events in IndexedDB` → must appear (confirms
 *     the error was caught and correctly downgraded)
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Injects an IDB abort interceptor into the page BEFORE any scripts run.
 * Patches IDBObjectStore.prototype.put and .openCursor so individual tests can
 * arm an abort for a specific store, then read back whether it fired.
 *
 * Control surface exposed on `window.__idbAbortCtrl`:
 *   abortOnPut:        store name to intercept (or null to disable)
 *   abortOnCursor:     store name to intercept (or null to disable)
 *   putAbortFired:     set to true after the put-abort fires
 *   cursorAbortFired:  set to true after the cursor-abort fires
 */
function injectIdbAbortInterceptor(page: import('@playwright/test').Page) {
  return page.addInitScript(() => {
    const ctrl: {
      abortOnPut: string | null;
      abortOnCursor: string | null;
      putAbortFired: boolean;
      cursorAbortFired: boolean;
    } = {
      abortOnPut: null,
      abortOnCursor: null,
      putAbortFired: false,
      cursorAbortFired: false,
    };
    (window as any).__idbAbortCtrl = ctrl;

    // Patch put: abort the transaction from within the request's success handler.
    // This simulates a browser-initiated abort that happens after a write succeeds
    // but before the transaction auto-commits — the exact scenario that left tx.done
    // as an unhandled rejection in the old code.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      const req = originalPut.call(this, value, key);
      if (ctrl.abortOnPut !== null && this.name === ctrl.abortOnPut) {
        ctrl.abortOnPut = null; // one-shot
        const tx = this.transaction;
        req.addEventListener(
          'success',
          () => {
            ctrl.putAbortFired = true;
            try {
              tx.abort();
            } catch {
              // ignore if already committed
            }
          },
          { once: true },
        );
      }
      return req;
    };

    // Patch openCursor: abort the transaction from within the cursor request's
    // success handler, simulating an abort that occurs while getSequencesToSend
    // is traversing the sequencesToSend store.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalOpenCursor = IDBObjectStore.prototype.openCursor;
    IDBObjectStore.prototype.openCursor = function (query, direction) {
      const req = originalOpenCursor.call(this, query, direction);
      if (ctrl.abortOnCursor !== null && this.name === ctrl.abortOnCursor) {
        ctrl.abortOnCursor = null; // one-shot
        const tx = this.transaction;
        req.addEventListener(
          'success',
          () => {
            ctrl.cursorAbortFired = true;
            try {
              tx.abort();
            } catch {
              // ignore
            }
          },
          { once: true },
        );
      }
      return req;
    };
  });
}

/** Collect all console messages of a given Playwright type. */
function captureConsoleMessages(page: import('@playwright/test').Page, type: string): string[] {
  const messages: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === type) messages.push(msg.text());
  });
  return messages;
}

/** Collect all console.warn messages. */
function captureWarns(page: import('@playwright/test').Page) {
  return captureConsoleMessages(page, 'warning');
}

/** Collect all console.log messages (the Amplitude SDK logs [Debug] via console.log). */
function captureDebugLogs(page: import('@playwright/test').Page) {
  return captureConsoleMessages(page, 'log');
}

/**
 * Collect all uncaught page errors, including unhandled Promise rejections.
 *
 * This is the key regression guard for the IDB abort fix: before the fix,
 * `tx.done` rejections were left unhandled and appeared here as
 * "Unhandled promise rejection: AbortError: The transaction was aborted".
 * After the fix, `.catch()` is attached immediately so these never surface
 * as page errors — they are routed through `logIdbError` → debug level.
 */
function capturePageErrors(page: import('@playwright/test').Page): Error[] {
  const errors: Error[] = [];
  page.on('pageerror', (err) => errors.push(err));
  return errors;
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
   * When the first event is written for a session, the SDK calls:
   *   tx.store.get(sessionId)  → undefined (no prior data)
   *   tx.store.put({ sessionId, events: [event] })
   *   [old code] return;      ← tx.done rejection is unhandled → AbortError bypasses logIdbError
   *   [new code] tx.done.catch(logIdbError) ← attached before any await → AbortError → debug
   *
   * We arm the interceptor so that the put succeeds but the transaction is
   * immediately aborted, then assert the SDK logs at debug (not warn).
   */
  test('addEventToCurrentSequence first-event path: AbortError logged at debug not warn', async ({ page }) => {
    await injectIdbAbortInterceptor(page);
    const warns = captureWarns(page);
    const debugLogs = captureDebugLogs(page);
    const pageErrors = capturePageErrors(page);

    // Arm before navigation so it catches the first IDB write (rrweb full snapshot)
    await page.addInitScript(() => {
      (window as any).__idbAbortCtrl.abortOnPut = 'sessionCurrentSequence';
    });

    await loadPage(page);

    // Give the abort time to propagate through the Promise chain
    await page.waitForTimeout(300);

    const abortFired = await page.evaluate(() => (window as any).__idbAbortCtrl.putAbortFired as boolean);
    expect(abortFired).toBe(true);

    const storageWarn = warns.filter((m) => m.includes(STORAGE_FAILURE));
    const storageDebug = debugLogs.filter((m) => m.includes(STORAGE_FAILURE));

    // tx.done rejection must be handled (not unhandled) — the core regression guard
    expect(pageErrors).toHaveLength(0);
    // Error must be logged at debug (not warn) — exactly once (errorLogged flag prevents double-log)
    expect(storageWarn).toHaveLength(0);
    expect(storageDebug).toHaveLength(1);
  });

  /**
   * Repro: addEventToCurrentSequence — existing-events path.
   *
   * After at least one event has been stored, subsequent events take the else branch:
   *   tx.store.get(sessionId)  → existing sequence
   *   tx.store.put({ sessionId, events: [..., newEvent] })
   *   [both old and new code reach this point — tx.done.catch() handles it either way]
   *
   * Arms the abort on the SECOND put (after the first event is safely stored),
   * confirming the fix doesn't regress the existing-events path.
   */
  test('addEventToCurrentSequence existing-events path: AbortError logged at debug not warn', async ({ page }) => {
    await injectIdbAbortInterceptor(page);
    const warns = captureWarns(page);
    const debugLogs = captureDebugLogs(page);
    const pageErrors = capturePageErrors(page);

    await loadPage(page);

    // At this point at least one event (the rrweb snapshot) has been stored.
    // Arm the interceptor for the NEXT write and trigger it with a user interaction.
    await page.evaluate(() => {
      (window as any).__idbAbortCtrl.abortOnPut = 'sessionCurrentSequence';
    });

    await page.click('#test-button');
    await page.waitForTimeout(300);

    const abortFired = await page.evaluate(() => (window as any).__idbAbortCtrl.putAbortFired as boolean);
    expect(abortFired).toBe(true);

    const storageWarn = warns.filter((m) => m.includes(STORAGE_FAILURE));
    const storageDebug = debugLogs.filter((m) => m.includes(STORAGE_FAILURE));

    expect(pageErrors).toHaveLength(0);
    expect(storageWarn).toHaveLength(0);
    expect(storageDebug).toHaveLength(1);
  });

  /**
   * Repro: getSequencesToSend — cursor abort mid-traversal.
   *
   * `getSequencesToSend` is called by `sendStoredEvents`, which runs during SDK
   * initialisation (`init()` → `initialize(shouldSendStoredEvents=true)`). It reads
   * stored sequences using a cursor on the `sequencesToSend` store. If the transaction
   * aborts while the cursor is open, `tx.done` rejects with AbortError.
   *
   * Before the fix `tx.done` was never caught, producing an unhandled rejection.
   * After the fix `tx.done.catch(logIdbError)` is attached before any await, so the
   * rejection always flows through `logIdbError` → `debug`.
   *
   * Because `getSequencesToSend` is only triggered on page load (not via `flush()`),
   * this test uses a two-navigation approach:
   *   1. Load the page normally so the SDK is up and IDB is populated.
   *   2. Arm the cursor interceptor via sessionStorage (persists across reloads).
   *   3. Reload — `init()` triggers `sendStoredEvents` → `getSequencesToSend` → abort.
   */
  test('getSequencesToSend cursor abort: AbortError logged at debug not warn', async ({ page }) => {
    await injectIdbAbortInterceptor(page);

    // Second init script: arm the cursor abort on the next page load if the sessionStorage
    // flag is set.  Runs after injectIdbAbortInterceptor so __idbAbortCtrl already exists.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('__armCursorAbort') === '1') {
        sessionStorage.removeItem('__armCursorAbort');
        (window as any).__idbAbortCtrl.abortOnCursor = 'sequencesToSend';
      }
    });

    const warns = captureWarns(page);
    const debugLogs = captureDebugLogs(page);
    const pageErrors = capturePageErrors(page);

    // First load: SDK initialises and records normally (cursor abort not yet armed)
    await loadPage(page);

    // Arm the cursor abort for the next navigation via sessionStorage
    await page.evaluate(() => sessionStorage.setItem('__armCursorAbort', '1'));

    // Reload: init() → initialize(true) → sendStoredEvents → getSequencesToSend → cursor abort
    await page.reload();
    await waitForReady(page);
    await page.waitForTimeout(300);

    const abortFired = await page.evaluate(() => (window as any).__idbAbortCtrl.cursorAbortFired as boolean);
    expect(abortFired).toBe(true);

    const storageWarn = warns.filter((m) => m.includes(STORAGE_FAILURE));
    const storageDebug = debugLogs.filter((m) => m.includes(STORAGE_FAILURE));

    expect(pageErrors).toHaveLength(0);
    expect(storageWarn).toHaveLength(0);
    expect(storageDebug).toHaveLength(1);
  });

  /**
   * Resilience: the SDK continues recording after an IDB abort.
   *
   * An IDB transaction abort is a transient error — the SDK should recover and be
   * able to record subsequent events. This test verifies that:
   *   1. An abort is triggered and handled gracefully (no crash, no warn)
   *   2. After the abort, the SDK can still receive new events and eventually flush them
   */
  test('SDK continues recording after IDB abort', async ({ page }) => {
    await injectIdbAbortInterceptor(page);
    const warns = captureWarns(page);
    const debugLogs = captureDebugLogs(page);
    const pageErrors = capturePageErrors(page);

    // Arm before load → aborts the very first IDB write
    await page.addInitScript(() => {
      (window as any).__idbAbortCtrl.abortOnPut = 'sessionCurrentSequence';
    });

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

    // Abort must be handled (not unhandled), logged at debug (not warn), exactly once
    const storageWarn = warns.filter((m) => m.includes(STORAGE_FAILURE));
    const storageDebug = debugLogs.filter((m) => m.includes(STORAGE_FAILURE));
    expect(pageErrors).toHaveLength(0);
    expect(storageWarn).toHaveLength(0);
    expect(storageDebug).toHaveLength(1);
  });

  /**
   * Baseline: no IDB errors during normal operation.
   *
   * Sanity check that in a normal recording session (no forced aborts) there are
   * no IDB-related warnings or debug-level storage errors at all.
   */
  test('normal recording: no IDB errors', async ({ page }) => {
    const warns = captureWarns(page);
    const debugLogs = captureDebugLogs(page);
    const pageErrors = capturePageErrors(page);

    await loadPage(page);
    await page.click('#test-button');
    await page.click('#test-input');
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => void (window as any).sessionReplay.flush(false));
    await page.waitForTimeout(300);

    const storageWarn = warns.filter((m) => m.includes(STORAGE_FAILURE));
    const storageDebug = debugLogs.filter((m) => m.includes(STORAGE_FAILURE));
    expect(pageErrors).toHaveLength(0);
    expect(storageWarn).toHaveLength(0);
    expect(storageDebug).toHaveLength(0);
  });
});
