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
  // Real-browser kill-switch race-window detection is covered deterministically by the
  // module-level integration test (test/integration.test.ts) and the unit test suite —
  // those use fake timers to eliminate timing flake. This e2e is a baseline sanity
  // check that the network mock + SDK plumbing wire up correctly: with no skip header,
  // the SDK keeps POSTing as expected, which guards against future regressions where
  // the header parsing accidentally affects the no-header path.
  test('clean 200 (no skip header): SDK continues to POST normally', async ({ page }) => {
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

    // Trigger a fresh event and another flush — should produce additional POSTs
    // because no back-pressure directive was issued.
    await page.evaluate(() => {
      document.getElementById('test-button')?.click();
      document.getElementById('test-input')?.focus();
    });
    await flushSessionReplay(page);

    expect(sentUrls.length).toBeGreaterThan(sentAfterFirst);
  });
});
