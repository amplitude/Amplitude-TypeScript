import { test, expect, Route } from '@playwright/test';
import {
  TEST_SESSION_ID,
  SNAPSHOT_SETTLE_MS,
  remoteConfigRecording,
  mockRemoteConfig,
  buildUrl,
  waitForReady,
} from './helpers';

/**
 * Mocks the track API with a configurable response — used to simulate the server's
 * 200 + X-Session-Replay-Event-Skipped header (the no-retry signal for throttle /
 * capture-disabled / session-out-of-range). See SR-4280.
 */
function mockTrackApiWithSkipHeader(
  page: import('@playwright/test').Page,
  options: {
    skipCode?: string | null; // null = clean 200 (no header)
    onRequest?: (route: Route) => void;
  },
) {
  const headers: Record<string, string> = options.skipCode
    ? { 'X-Session-Replay-Event-Skipped': options.skipCode }
    : {};
  return page.route('https://api-sr.amplitude.com/**', (route: Route) => {
    options.onRequest?.(route);
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: 'success',
    });
  });
}

async function flushSessionReplay(page: import('@playwright/test').Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('blur')) as unknown as void);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
  await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
}

test.describe('server back-pressure (X-Session-Replay-Event-Skipped header)', () => {
  test('hard-kill (4005 capture_disabled): SDK stops POSTing for the killed session', async ({ page }) => {
    const sentUrls: string[] = [];
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApiWithSkipHeader(page, {
      skipCode: '4005',
      onRequest: (route) => sentUrls.push(route.request().url()),
    });

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
      }),
    );
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    // First flush — server returns 200 + 4005 → kill switch fires.
    await flushSessionReplay(page);
    const sentBeforeKill = sentUrls.length;
    expect(sentBeforeKill).toBeGreaterThan(0);

    // Generate more activity and flush again. The kill should drop these batches without
    // issuing another POST for the same session.
    await page.evaluate(() => {
      // Click the test button to generate a fresh rrweb event
      document.getElementById('test-button')?.click();
      document.getElementById('test-input')?.focus();
    });
    await flushSessionReplay(page);
    await flushSessionReplay(page);

    // No additional POSTs should have been issued — the kill switch is honored.
    expect(sentUrls.length).toBe(sentBeforeKill);
  });

  test('hard-kill (4004 session_in_invalid_range): SDK stops POSTing for the killed session', async ({ page }) => {
    const sentUrls: string[] = [];
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApiWithSkipHeader(page, {
      skipCode: '4004',
      onRequest: (route) => sentUrls.push(route.request().url()),
    });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    await flushSessionReplay(page);
    const sentBeforeKill = sentUrls.length;
    expect(sentBeforeKill).toBeGreaterThan(0);

    await page.evaluate(() => {
      document.getElementById('test-input')?.focus();
    });
    await flushSessionReplay(page);

    expect(sentUrls.length).toBe(sentBeforeKill);
  });

  test('clean 200 (no skip header): SDK continues to POST normally', async ({ page }) => {
    // Sanity baseline: with no skip header, multiple flushes produce multiple POSTs.
    // This guards against the kill-switch test passing trivially due to event quiescence.
    const sentUrls: string[] = [];
    await mockRemoteConfig(page, remoteConfigRecording);
    await mockTrackApiWithSkipHeader(page, {
      skipCode: null,
      onRequest: (route) => sentUrls.push(route.request().url()),
    });

    await page.goto(buildUrl('/session-replay-browser/sr-capture-test.html', { sessionId: TEST_SESSION_ID }));
    await waitForReady(page);
    await page.waitForTimeout(SNAPSHOT_SETTLE_MS);

    await flushSessionReplay(page);
    const sentAfterFirst = sentUrls.length;
    expect(sentAfterFirst).toBeGreaterThan(0);

    // Trigger a fresh event and another flush — should produce additional POSTs.
    await page.evaluate(() => {
      document.getElementById('test-button')?.click();
      document.getElementById('test-input')?.focus();
    });
    await flushSessionReplay(page);

    expect(sentUrls.length).toBeGreaterThan(sentAfterFirst);
  });
});
