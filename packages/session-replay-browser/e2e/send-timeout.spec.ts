import { test, expect, Page, Route } from '@playwright/test';
import {
  TEST_SESSION_ID,
  SNAPSHOT_SETTLE_MS,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
} from './helpers';

/**
 * Mirrors SEND_TIMEOUT_MS from src/constants.ts (10s). The e2e suite drives the *built*
 * SDK as a black box, so we keep a local copy rather than importing an internal constant.
 */
const SEND_TIMEOUT_MS = 10_000;

type HungRequestMock = {
  getAttempts: () => number;
  getSuccesses: () => number;
  /**
   * True once a clean 200 has landed at least ~SEND_TIMEOUT_MS after the first (hung)
   * request. A delivery that late could only have happened because the stalled request
   * was aborted on timeout and its batch recovered (retried, or a later queued batch
   * drained) — i.e. the serial flush queue did NOT permanently block on the hung send.
   */
  hasRecoveredDelivery: () => boolean;
};

/**
 * Routes the track API so the FIRST POST hangs forever (the route is never resolved, so
 * the SDK's per-request AbortController is the only thing that can free it after
 * SEND_TIMEOUT_MS), while every subsequent POST returns a clean 200. This reproduces the
 * "one request stuck pending forever" scenario PR #1808 fixes: without the timeout/abort
 * the hung request would head-of-line-block the serial flush queue indefinitely.
 */
async function mockFirstSendHangs(page: Page): Promise<HungRequestMock> {
  let attempts = 0;
  let successes = 0;
  let firstRequestAt: number | null = null;
  const successAts: number[] = [];

  await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
    // A CORS preflight (if the browser issues one) isn't part of the send budget — never
    // hang it, and don't count it as a send attempt.
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    attempts += 1;
    if (firstRequestAt === null) firstRequestAt = Date.now();

    if (attempts === 1) {
      // Hang the very first POST: return without resolving the route so the request stays
      // pending. The SDK must abort it after SEND_TIMEOUT_MS; we deliberately never fulfill.
      return;
    }

    successes += 1;
    successAts.push(Date.now());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200 }) });
  });

  return {
    getAttempts: () => attempts,
    getSuccesses: () => successes,
    hasRecoveredDelivery: () =>
      firstRequestAt !== null && successAts.some((t) => t - (firstRequestAt as number) >= SEND_TIMEOUT_MS - 1500),
  };
}

const SEND_PATHS = [
  { name: 'main-thread fetch', useWebWorker: false },
  { name: 'web worker', useWebWorker: true },
] as const;

test.describe('send timeout — a hung request does not block the flush queue (#1808)', () => {
  for (const { name, useWebWorker } of SEND_PATHS) {
    test(`${name}: request stuck past SEND_TIMEOUT_MS aborts and delivery recovers`, async ({ page }) => {
      // SEND_TIMEOUT_MS is 10s and the abort is followed by a retry/backoff, so the run
      // exceeds the 30s default per-test timeout. Give it generous headroom.
      test.setTimeout(60_000);

      await mockRemoteConfig(page, remoteConfigRecording);
      const mock = await mockFirstSendHangs(page);

      await page.goto(
        buildUrl('/session-replay-browser/sr-capture-test.html', {
          sessionId: TEST_SESSION_ID,
          useWebWorker,
        }),
      );
      await waitForReady(page);
      // Let rrweb capture its initial full snapshot so there's a real batch to send.
      await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

      // blur → sendEvents → sendCurrentSequenceEvents → trackDestination.addToQueue →
      // schedule(0) → flush(true): dispatches the snapshot batch through the retry-enabled
      // send path. The mock hangs this first POST.
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));

      // The first send must actually go out (and then hang) before we can prove recovery.
      await expect.poll(() => mock.getAttempts(), { timeout: 15_000 }).toBeGreaterThan(0);

      // After SEND_TIMEOUT_MS the hung request is aborted. On the main-thread path the abort
      // surfaces as an AbortError routed through handleOtherResponse (retry budget); on the
      // worker path the worker's own AbortController retries and the main thread stops
      // awaiting so the loop proceeds. Either way a clean 200 must land ~10s after the hung
      // request — proving the queue recovered rather than stalling forever.
      await expect.poll(() => mock.hasRecoveredDelivery(), { timeout: 45_000, intervals: [500] }).toBe(true);

      // Sanity: at least the hung attempt + one more, and at least one successful delivery.
      expect(mock.getAttempts()).toBeGreaterThanOrEqual(2);
      expect(mock.getSuccesses()).toBeGreaterThanOrEqual(1);
    });
  }
});
