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
 * Mocks the track API so we can confirm the SDK actually delivers events
 * through the full real-browser pipeline.
 */
async function captureTrackRequestUrls(page: Page): Promise<{ getUrls: () => string[] }> {
  const urls: string[] = [];
  await page.route('https://api-sr.amplitude.com/**', async (route: Route) => {
    urls.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  return { getUrls: () => urls };
}

async function flushAndSettle(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
  await page.evaluate(() => (window as any).sessionReplay.flush(false) as Promise<void>);
  await page.waitForTimeout(SNAPSHOT_SETTLE_MS);
}

test.describe('flushIntervalConfig', () => {
  // The unit + integration tests in test/ exhaustively cover the validator and the
  // value-propagation through createEventsManager (including the first-split regression
  // bugbot caught). These e2e tests are the last-mile guard that a real browser, going
  // through the full SDK init path with Vite + worker compression + rrweb, accepts the
  // option without surfacing init errors and still emits events end-to-end.

  test('initializes cleanly with custom min/max and delivers events on explicit flush', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getUrls } = await captureTrackRequestUrls(page);

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        flushMinIntervalMs: 5000,
        flushMaxIntervalMs: 30_000,
      }),
    );
    await waitForReady(page);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const initError = await page.evaluate(() => (window as any).srError as string | undefined);
    expect(initError).toBeUndefined();

    await page.evaluate(() => {
      document.getElementById('test-button')?.click();
    });
    await flushAndSettle(page);

    expect(getUrls().length).toBeGreaterThan(0);
    const sdkErrors = consoleErrors.filter((e) => /session.replay|amplitude/i.test(e));
    expect(sdkErrors).toEqual([]);
  });

  test('Infinity maxIntervalMs is accepted and the SDK initializes cleanly', async ({ page }) => {
    await mockRemoteConfig(page, remoteConfigRecording);
    const { getUrls } = await captureTrackRequestUrls(page);

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        flushMinIntervalMs: 5000,
        flushMaxIntervalMs: 'Infinity',
      }),
    );
    await waitForReady(page);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const initError = await page.evaluate(() => (window as any).srError as string | undefined);
    expect(initError).toBeUndefined();

    await flushAndSettle(page);

    // Recording is functional even with an unbounded upper interval.
    expect(getUrls().length).toBeGreaterThan(0);
    const sdkErrors = consoleErrors.filter((e) => /session.replay|amplitude/i.test(e));
    expect(sdkErrors).toEqual([]);
  });

  test('sub-floor minIntervalMs is clamped without aborting init', async ({ page }) => {
    // Validator clamps to the 100ms floor and emits a warn; init must still succeed.
    await mockRemoteConfig(page, remoteConfigRecording);
    await captureTrackRequestUrls(page);

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(
      buildUrl('/session-replay-browser/sr-capture-test.html', {
        sessionId: TEST_SESSION_ID,
        flushMinIntervalMs: 0,
      }),
    );
    await waitForReady(page);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const initError = await page.evaluate(() => (window as any).srError as string | undefined);
    expect(initError).toBeUndefined();
    const sdkErrors = consoleErrors.filter((e) => /session.replay|amplitude/i.test(e));
    expect(sdkErrors).toEqual([]);
  });
});
